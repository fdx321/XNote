import React from 'react';
import { useAppStore, FileNode } from '../store';
import { FileText, Calendar } from 'lucide-react';

export const CardView: React.FC = () => {
  const { files, setSelectedFile, setViewMode } = useAppStore();
  
  // Flatten all notes for card view, or just show top level?
  // User said "Right side is editor... Note management supports Card view"
  // Usually Card View replaces the editor when a folder is selected.
  // I will gather all notes from all folders for now, or just the current "context".
  // Since we don't have "current folder" state other than `currentPath` (root), 
  // let's show all notes in the root + children.
  
  const allNotes = React.useMemo(() => {
      const notes: FileNode[] = [];
      const traverse = (nodes: FileNode[]) => {
          nodes.forEach(node => {
              if (!node.is_dir) {
                  notes.push(node);
              }
              if (node.children) {
                  traverse(node.children);
              }
          });
      };
      traverse(files);
      return notes;
  }, [files]);

  const handleNoteClick = (note: FileNode) => {
      setSelectedFile(note);
      setViewMode('tree'); // Go to editor
  };

  return (
    <div className="flex-1 h-full bg-background p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-6">All Notes</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {allNotes.map(note => (
                <div 
                    key={note.path as string}
                    onClick={() => handleNoteClick(note)}
                    className="bg-surface p-4 rounded-lg border border-border hover:border-accent cursor-pointer transition-all hover:shadow-lg group"
                >
                    <div className="flex items-start justify-between mb-2">
                        <FileText className="text-accent" size={20} />
                    </div>
                    <h3 className="font-semibold text-lg mb-1 truncate group-hover:text-accent transition-colors">
                        {note.name}
                    </h3>
                    <div className="flex items-center text-muted text-xs mt-4">
                        <Calendar size={12} className="mr-1" />
                        <span>{note.last_modified || 'Just now'}</span>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
};
