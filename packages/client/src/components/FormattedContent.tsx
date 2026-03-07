import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { Channel, MessageRole } from '@tms/shared';
import { CodeBlock } from './CodeBlock.js';

interface FormattedContentProps {
  content: string;
  channel: Channel;
  role: MessageRole;
}

function linkColor(channel: Channel, role: MessageRole): string {
  if (channel === 'whatsapp') return 'text-blue-500 dark:text-blue-400';
  return role === 'user' ? 'text-blue-200' : 'text-indigo-600 dark:text-indigo-400';
}

function inlineCodeClasses(channel: Channel, role: MessageRole): string {
  if (channel === 'whatsapp') {
    return 'bg-black/10 dark:bg-white/10';
  }
  return role === 'user' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-600';
}

export function FormattedContent({ content, channel, role }: FormattedContentProps) {
  const components: Components = {
    p: ({ children }) => (
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{children}</p>
    ),
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    del: ({ children }) => <del>{children}</del>,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline ${linkColor(channel, role)}`}
      >
        {children}
      </a>
    ),
    h1: ({ children }) => (
      <p className="text-[15px] font-bold mt-2 leading-relaxed">{children}</p>
    ),
    h2: ({ children }) => (
      <p className="text-[14px] font-bold mt-1.5 leading-relaxed">{children}</p>
    ),
    h3: ({ children }) => (
      <p className="text-[13px] font-bold mt-1 leading-relaxed">{children}</p>
    ),
    ul: ({ children }) => <ul className="list-disc pl-4 text-[13px] leading-relaxed">{children}</ul>,
    ol: ({ children }) => (
      <ol className="list-decimal pl-4 text-[13px] leading-relaxed">{children}</ol>
    ),
    li: ({ children }) => <li className="mt-0.5">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 pl-2 opacity-80 italic">{children}</blockquote>
    ),
    code: ({ className, children }) => {
      const match = /language-(\w+)/.exec(className || '');
      const codeStr = String(children);

      if (match) {
        return <CodeBlock language={match[1]}>{codeStr}</CodeBlock>;
      }

      // Check if this is a block-level code (wrapped in pre)
      // react-markdown wraps fenced code in <pre><code>
      if (!className && codeStr.includes('\n')) {
        return <CodeBlock>{codeStr}</CodeBlock>;
      }

      return (
        <code
          className={`font-mono text-[12px] px-1 py-0.5 rounded ${inlineCodeClasses(channel, role)}`}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => <>{children}</>,
    table: ({ children }) => (
      <div className="overflow-x-auto my-1">
        <table className="text-[12px] border-collapse">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-current/20 px-2 py-1 font-semibold text-left">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border border-current/20 px-2 py-1">{children}</td>
    ),
  };

  return (
    <div className="formatted-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
