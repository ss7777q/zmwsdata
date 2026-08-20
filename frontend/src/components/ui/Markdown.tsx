import { useEffect, useRef } from 'react';
import { marked } from 'marked';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function protectMath(text: string) {
  const segments: string[] = [];
  const source = text.replace(
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^\n\\$])+(?<!\\)\$)/g,
    (match) => {
      const index = segments.push(match) - 1;
      return `@@COLD_KNOWLEDGE_MATH_${index}@@`;
    }
  );

  return {
    source,
    restore(html: string) {
      return html.replace(/@@COLD_KNOWLEDGE_MATH_(\d+)@@/g, (_match, index) => escapeHtml(segments[Number(index)] ?? ''));
    },
  };
}

function formatMarkdown(text: string, inline = false): string {
  const math = protectMath(text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim());
  const markdownSource = math.source.replace(/(?<=\d)~(?=\d)/g, () => '\\~');
  if (!markdownSource) return '';

  const html = inline
    ? (marked.parseInline(markdownSource, { gfm: true, breaks: false }) as string)
    : (marked.parse(markdownSource, { gfm: true, breaks: false }) as string);
  return math
    .restore(html)
    .replace(/<table>/g, '<div class="markdown-table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

export default function Markdown({ text, className, inline = false }: { text: string; className?: string; inline?: boolean }) {
  const containerRef = useRef<HTMLSpanElement | HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = formatMarkdown(text, inline);
      try {
        renderMathInElement(containerRef.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true },
          ],
          throwOnError: false,
        });
      } catch (e) {
        console.error('KaTeX rendering error:', e);
      }
    }
  }, [inline, text]);

  const Component = inline ? 'span' : 'div';
  return <Component ref={containerRef as never} className={className} />;
}