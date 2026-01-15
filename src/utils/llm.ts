import { ChatMessage, LLMConfig } from '../store';
import { fetch } from '@tauri-apps/plugin-http';

export async function chatWithLLM(
  messages: ChatMessage[],
  config: LLMConfig,
  onUpdate?: (content: string) => void
): Promise<string> {
  // Check if it's an image generation model
  if (config.type === 'image') {
      return generateImage(messages, config, onUpdate);
  }

  if (config.provider === 'openai' || config.provider === 'custom') {
    return chatWithOpenAICompatible(messages, config, onUpdate);
  }
  // Fallback or other providers
  throw new Error(`Provider ${config.provider} not supported`);
}

async function generateImage(
  messages: ChatMessage[],
  config: LLMConfig,
  onUpdate?: (content: string) => void
): Promise<string> {
  // Use the last user message as the prompt
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage) {
      throw new Error('No user message found for image prompt');
  }
  const prompt = lastUserMessage.content;

  if (onUpdate) onUpdate("Generating image...");

  // Construct standard OpenAI Image Generation URL
  // Base: https://api.openai.com/v1 -> https://api.openai.com/v1/images/generations
  let url = config.baseUrl;
  if (url.endsWith('/v1')) {
      url = `${url}/images/generations`;
  } else if (!url.endsWith('/images/generations')) {
      // Basic heuristic: replace /chat/completions if present, or append
      url = url.replace(/\/chat\/completions$/, '');
      url = url.replace(/\/$/, '');
      url = `${url}/images/generations`;
  }

  const modelId = config.modelId.trim();
  const apiKey = config.apiKey.trim();

  console.log('[LLM] Generating Image URL:', url);
  console.log('[LLM] Model:', modelId);
  console.log('[LLM] Prompt:', prompt);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  let body: string;
  const isVolcengine = url.includes('volces.com');

  if (isVolcengine) {
      // Volcengine specific body
      const payload = {
          model: modelId,
          prompt,
          sequential_image_generation: "disabled",
          response_format: "url",
          size: "2K", // Use 2K as per user demo
          stream: false,
          watermark: false
      };
      body = JSON.stringify(payload);
      console.log('[LLM] Volcengine Request Body:', JSON.stringify(payload, null, 2));
  } else {
      // Standard OpenAI body
      const payload = {
          prompt,
          model: modelId,
          n: 1,
          size: "1024x1024",
          response_format: "url"
      };
      body = JSON.stringify(payload);
      console.log('[LLM] OpenAI Request Body:', JSON.stringify(payload, null, 2));
  }

  try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Image API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const imageUrl = data.data?.[0]?.url;

      if (!imageUrl) {
          throw new Error('No image URL in response');
      }

      const markdown = `![Generated Image](${imageUrl})`;
      if (onUpdate) onUpdate(markdown);
      return markdown;

  } catch (err) {
      console.error("Image Generation Failed:", err);
      throw err;
  }
}

async function chatWithOpenAICompatible(
  messages: ChatMessage[],
  config: LLMConfig,
  onUpdate?: (content: string) => void
): Promise<string> {
  // Smart URL construction
  let url = config.baseUrl;
  
  // Handle query parameters if present (e.g., Azure OpenAI)
  const hasQueryParams = url.includes('?');
  const [baseUrlPath, queryParams] = hasQueryParams ? url.split('?') : [url, ''];
  
  // Normalize base path
  let cleanPath = baseUrlPath.replace(/\/$/, '');

  // Heuristic: If the path already contains "/chat/" or ends with "/completions", 
  // or explicitly uses "/api/coding" (user specified endpoint),
  // assume the user provided a full endpoint URL and do NOT append anything.
  // Otherwise, append the standard /chat/completions suffix.
  if (!cleanPath.includes('/chat/') && !cleanPath.endsWith('/completions') && !cleanPath.includes('/api/coding')) {
      cleanPath = `${cleanPath}/chat/completions`;
  }
  
  // Reconstruct URL
  url = hasQueryParams ? `${cleanPath}?${queryParams}` : cleanPath;

  console.log('[LLM] Requesting:', url);
  console.log('[LLM] Model:', config.modelId);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`
  };

  const body = JSON.stringify({
    model: config.modelId,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: !!onUpdate
  });

  try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText} (URL: ${url})`);
      }

      if (onUpdate) {
        // Handle streaming
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        
        if (!reader) throw new Error('Response body is null');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.trim() === '') continue;
            if (line.trim() === 'data: [DONE]') continue;
            
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices[0]?.delta?.content || '';
                fullContent += content;
                onUpdate(fullContent);
              } catch (e) {
                console.error('Error parsing stream chunk', e);
              }
            }
          }
        }
        return fullContent;
      } else {
        const data = await response.json();
        return data.choices[0].message.content;
      }
  } catch (err) {
      console.error("LLM Request Failed:", err);
      throw err;
  }
}
