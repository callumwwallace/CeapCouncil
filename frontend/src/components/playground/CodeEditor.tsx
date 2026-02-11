'use client';

import Editor from '@monaco-editor/react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function CodeEditor({ value, onChange }: CodeEditorProps) {
  return (
    <Editor
      height="100%"
      defaultLanguage="python"
      value={value}
      onChange={(val) => onChange(val || '')}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'SF Mono', 'Fira Code', 'Monaco', monospace",
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,
        wordWrap: 'off',
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'line',
        cursorBlinking: 'smooth',
        smoothScrolling: true,
        folding: true,
        bracketPairColorization: { enabled: true },
        lineHeight: 20,
        letterSpacing: 0.3,
        renderWhitespace: 'selection',
        guides: {
          indentation: true,
          bracketPairs: true,
        },
      }}
      loading={
        <div className="h-full flex items-center justify-center bg-[#1e1e1e]">
          <div className="text-gray-400 text-sm">Loading editor...</div>
        </div>
      }
    />
  );
}
