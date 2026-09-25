import { splitSummarySentences } from "../findings/strideSummary";

interface SummaryBlocksProps {
  text: string;
}

export function SummaryBlocks({ text }: SummaryBlocksProps): JSX.Element {
  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return (
    <div className="space-y-4" data-testid="audit-summary">
      {blocks.map((block, index) => (
        <SummaryBlock key={`${index}-${block.slice(0, 24)}`} block={block} />
      ))}
    </div>
  );
}

function SummaryBlock({ block }: { block: string }): JSX.Element {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const heading = lines[0]?.endsWith(":") ? lines[0].replace(/:$/, "") : "";
  const body = (heading ? lines.slice(1) : lines).join(" ");
  const sentences = splitSummarySentences(body);

  return (
    <div>
      {heading && <h4 className="text-sm font-semibold text-[var(--md-on-surface)]">{heading}</h4>}
      {sentences.length > 1 ? (
        <ul className={`${heading ? "mt-2" : ""} list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--md-on-surface-variant)]`}>
          {sentences.map((sentence, index) => (
            <li key={`${index}-${sentence.slice(0, 24)}`}>{sentence}</li>
          ))}
        </ul>
      ) : (
        <p className={`${heading ? "mt-2" : ""} text-sm leading-relaxed text-[var(--md-on-surface-variant)]`}>{body || block}</p>
      )}
    </div>
  );
}
