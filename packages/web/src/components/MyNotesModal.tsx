import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Bold, Underline as UnderlineIcon, List, ListOrdered } from 'lucide-react';

interface MyNotesModalProps {
  open: boolean;
  content: string | null;
  onSave: (html: string) => void;
  onClose: () => void;
  saveStatus: 'idle' | 'saving' | 'saved';
}

export default function MyNotesModal({ open, content, onSave, onClose, saveStatus }: MyNotesModalProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        italic: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        heading: false,
      }),
      Underline,
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onSave(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose-notes',
      },
    },
  }, [open]);

  // Reset content when modal opens with fresh data
  useEffect(() => {
    if (open && editor && !editor.isDestroyed) {
      const current = editor.getHTML();
      const incoming = content || '';
      // Only reset if the content actually differs (avoids cursor jump)
      if (current !== incoming && !(current === '<p></p>' && incoming === '')) {
        editor.commands.setContent(incoming);
      }
    }
  }, [open, editor, content]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // ESC key handler
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  if (!open) return null;

  const toolbarButtons = [
    {
      icon: Bold,
      label: 'Bold',
      action: () => editor?.chain().focus().toggleBold().run(),
      active: editor?.isActive('bold'),
    },
    {
      icon: UnderlineIcon,
      label: 'Underline',
      action: () => editor?.chain().focus().toggleUnderline().run(),
      active: editor?.isActive('underline'),
    },
    {
      icon: List,
      label: 'Bullet List',
      action: () => editor?.chain().focus().toggleBulletList().run(),
      active: editor?.isActive('bulletList'),
    },
    {
      icon: ListOrdered,
      label: 'Numbered List',
      action: () => editor?.chain().focus().toggleOrderedList().run(),
      active: editor?.isActive('orderedList'),
    },
  ];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 50 }}
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />
      <div
        className="rf-card relative w-full"
        style={{ maxWidth: 560, maxHeight: '80vh', overflow: 'auto', padding: 24, zIndex: 1 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2
            className="font-bold"
            style={{ fontFamily: "'Lora', serif", fontSize: 18, color: 'var(--text)' }}
          >
            My Notes
          </h2>
          <span
            className="text-xs transition-opacity"
            style={{
              color: 'var(--muted)',
              opacity: saveStatus === 'idle' ? 0 : 1,
            }}
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 mb-3" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          {toolbarButtons.map((btn) => (
            <button
              key={btn.label}
              onClick={btn.action}
              title={btn.label}
              className="flex items-center justify-center rounded-md transition-colors"
              style={{
                width: 32,
                height: 32,
                background: btn.active ? 'var(--green-light)' : 'transparent',
                color: btn.active ? 'var(--green)' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <btn.icon size={16} />
            </button>
          ))}
        </div>

        {/* Editor */}
        <EditorContent editor={editor} />

        {/* Footer */}
        <div className="flex justify-end mt-6">
          <button
            onClick={handleClose}
            className="rf-btn-secondary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
