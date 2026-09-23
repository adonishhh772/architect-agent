import { postPullRequestComment } from "@sentinel/ingestion";
import type { PullRequestReview as PullRequestReviewModel } from "@sentinel/schema";
import { useState, type ChangeEvent } from "react";
import { MaterialButton } from "../../../components/material/MaterialButton";
import { MaterialTextField } from "../../../components/material/MaterialTextField";

interface PullRequestReviewProps {
  review: PullRequestReviewModel;
  owner?: string;
  name?: string;
  githubToken: string;
}

export function PullRequestReview({
  review,
  owner,
  name,
  githubToken,
}: PullRequestReviewProps): JSX.Element {
  const [pullRequestNumber, setPullRequestNumber] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  const handleNumberChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setPullRequestNumber(event.target.value);
    setPosted(false);
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(review.commentBody);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not copy the review comment.");
    }
  };

  const handleCopyClick = (): void => {
    void handleCopy();
  };

  const handlePostClick = (): void => {
    void handlePost();
  };

  const handlePost = async (): Promise<void> => {
    const number = Number(pullRequestNumber);
    if (!owner || !name) {
      setError("Index a GitHub repository before posting a review comment.");
      return;
    }
    if (!githubToken.trim()) {
      setError("Add a GitHub token with pull request comment permission.");
      return;
    }
    if (!Number.isInteger(number) || number < 1) {
      setError("Enter the pull request number to comment on.");
      return;
    }
    setIsPosting(true);
    setError(null);
    setPosted(false);
    try {
      await postPullRequestComment({ owner, name }, number, review.commentBody, {
        token: githubToken.trim(),
        runtime: "browser",
      });
      setPosted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "GitHub rejected the review comment.");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="pull-request-review">
      <p className="text-sm text-[var(--md-on-surface-variant)]">
        {review.newFindingKeys.length} new, {review.regressedFindingKeys.length} regressed,{" "}
        {review.fixedFindingKeys.length} fixed since the previous snapshot.
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-[var(--md-outline)]/30 bg-[var(--md-surface-container-high)]/40 p-4 text-sm text-[var(--md-on-surface)]">
        {review.commentBody}
      </pre>
      <div className="grid gap-3 md:grid-cols-[180px_auto_auto] md:items-end">
        <MaterialTextField
          label="Pull request number"
          type="number"
          value={pullRequestNumber}
          min={1}
          onChange={handleNumberChange}
          data-testid="pull-request-number"
        />
        <MaterialButton variant="outlined" onClick={handleCopyClick} data-testid="copy-review-comment">
          Copy comment
        </MaterialButton>
        <MaterialButton onClick={handlePostClick} disabled={isPosting} data-testid="post-review-comment">
          {isPosting ? "Posting…" : "Post review comment"}
        </MaterialButton>
      </div>
      {posted && (
        <p className="text-sm text-[var(--color-neon-green)]" data-testid="review-posted">
          Review comment posted.
        </p>
      )}
      {error && (
        <p className="text-sm text-[var(--color-neon-pink)]" data-testid="review-post-error">
          {error}
        </p>
      )}
    </div>
  );
}
