// 게시 계획(dry-run)·성과 화면의 작은 표시 조각 — 서버 컴포넌트(JS 없음).
import type { IssueSeverity, SpecIssue } from "@yunseo/domain";
import { Badge, Text } from "@yunseo/ui";
import { SEVERITY_LABEL } from "@/lib/l5";

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  return <Badge tone={severity === "block" ? "alert" : "brass"}>{SEVERITY_LABEL[severity]}</Badge>;
}

/** 규격 위반 한 줄의 글 — 대상 · 내용 · 고치는 법 */
export function IssueText({ issue }: { issue: SpecIssue }) {
  return (
    <span>
      <Text size="body">{issue.message}</Text>
      {issue.fix && (
        <Text size="label" tone="mute" block>
          → {issue.fix}
        </Text>
      )}
    </span>
  );
}
