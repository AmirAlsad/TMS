import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import {
  oneDark,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useStore } from '../stores/store.js';

SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('html', markup);

interface CodeBlockProps {
  language?: string;
  children: string;
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const theme = useStore((s) => s.theme);
  const style = theme === 'dark' ? oneDark : oneLight;

  return (
    <div className="rounded-md overflow-hidden my-1 text-[12px]">
      {language && (
        <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wide bg-black/10 dark:bg-white/10 text-slate-500 dark:text-slate-400">
          {language}
        </div>
      )}
      <SyntaxHighlighter
        language={language || 'text'}
        style={style}
        customStyle={{ margin: 0, padding: '0.75rem', fontSize: '12px' }}
        wrapLongLines
      >
        {children.replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
}
