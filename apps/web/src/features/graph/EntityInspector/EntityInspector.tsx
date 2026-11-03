import type { ReactNode } from "react";
import {
  formatEdgeKind,
  formatFunctionLocation,
  formatInspectionPath,
  RELATION_DIRECTION,
  type EntityInspection,
  type EntityRelation,
  type InspectionFunction,
  type InspectionPathStep,
} from "../entityInspection";

export const ENTITY_INSPECTOR_COPY = {
  EMPTY: "Hover a component to see its functions, data flows, and every dependency path.",
  FUNCTIONS: "Functions",
  DATA_FLOWS: "Data flows",
  DEPENDENCIES: "Dependencies",
  DEPENDENTS: "Dependents",
  PATHS: "Paths",
  NONE_FUNCTIONS: "No functions were linked to this component.",
  NONE_FLOWS: "No source-to-sink data flow touches this component.",
  NONE_DEPENDENCIES: "This component has no outgoing dependency.",
  NONE_DEPENDENTS: "Nothing indexed depends on this component.",
  NONE_PATHS: "No dependency path was indexed for this component.",
  TRUNCATED: "Additional paths exist beyond the listed set.",
} as const;

interface EntityInspectorProps {
  inspection: EntityInspection | null;
}

export function EntityInspector({ inspection }: EntityInspectorProps): JSX.Element {
  if (!inspection) {
    return (
      <aside className="glass-card rounded-xl border border-white/10 p-4" data-testid="entity-inspector-empty">
        <p className="text-sm text-[var(--md-on-surface-variant)]">{ENTITY_INSPECTOR_COPY.EMPTY}</p>
      </aside>
    );
  }

  return (
    <aside className="glass-card max-h-[680px] overflow-auto rounded-xl border border-white/10 p-4" data-testid="entity-inspector">
      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-300">{formatEdgeKind(inspection.kind)}</p>
      <h3 className="mt-1 text-base font-semibold text-[var(--md-on-surface)]">{inspection.label}</h3>
      {inspection.description ? (
        <p className="mt-2 text-sm text-[var(--md-on-surface-variant)]">{inspection.description}</p>
      ) : null}
      <InspectorSection title={ENTITY_INSPECTOR_COPY.FUNCTIONS} testId="entity-inspector-functions">
        {inspection.functions.length === 0 ? (
          <EmptyLine text={ENTITY_INSPECTOR_COPY.NONE_FUNCTIONS} />
        ) : (
          <ul className="space-y-1">
            {inspection.functions.map(renderFunctionItem)}
          </ul>
        )}
      </InspectorSection>
      <InspectorSection title={ENTITY_INSPECTOR_COPY.DATA_FLOWS} testId="entity-inspector-data-flows">
        {inspection.dataFlows.length === 0 ? (
          <EmptyLine text={ENTITY_INSPECTOR_COPY.NONE_FLOWS} />
        ) : (
          <ul className="space-y-2">
            {inspection.dataFlows.map(renderRelationItem)}
          </ul>
        )}
      </InspectorSection>
      <InspectorSection title={ENTITY_INSPECTOR_COPY.DEPENDENCIES} testId="entity-inspector-dependencies">
        {inspection.dependencies.length === 0 ? (
          <EmptyLine text={ENTITY_INSPECTOR_COPY.NONE_DEPENDENCIES} />
        ) : (
          <ul className="space-y-2">
            {inspection.dependencies.map(renderRelationItem)}
          </ul>
        )}
      </InspectorSection>
      <InspectorSection title={ENTITY_INSPECTOR_COPY.DEPENDENTS} testId="entity-inspector-dependents">
        {inspection.dependents.length === 0 ? (
          <EmptyLine text={ENTITY_INSPECTOR_COPY.NONE_DEPENDENTS} />
        ) : (
          <ul className="space-y-2">
            {inspection.dependents.map(renderRelationItem)}
          </ul>
        )}
      </InspectorSection>
      <InspectorSection title={ENTITY_INSPECTOR_COPY.PATHS} testId="entity-inspector-paths">
        {inspection.paths.length === 0 ? (
          <EmptyLine text={ENTITY_INSPECTOR_COPY.NONE_PATHS} />
        ) : (
          <ul className="space-y-2">
            {inspection.paths.map(renderPathItem)}
          </ul>
        )}
        {inspection.pathsTruncated ? (
          <p className="mt-2 text-xs text-amber-200/90">{ENTITY_INSPECTOR_COPY.TRUNCATED}</p>
        ) : null}
      </InspectorSection>
    </aside>
  );
}

function renderFunctionItem(item: InspectionFunction): JSX.Element {
  return <FunctionItem key={item.id} item={item} />;
}

function renderRelationItem(relation: EntityRelation): JSX.Element {
  return <RelationItem key={`${relation.direction}:${relation.edgeId}`} relation={relation} />;
}

function renderPathItem(steps: InspectionPathStep[], index: number): JSX.Element {
  return <PathItem key={`${index}:${formatInspectionPath(steps)}`} steps={steps} index={index} />;
}

function InspectorSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="mt-4" data-testid={testId}>
      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--md-on-surface-variant)]">{title}</h4>
      <div className="mt-2 text-sm text-[var(--md-on-surface)]">{children}</div>
    </section>
  );
}

function EmptyLine({ text }: { text: string }): JSX.Element {
  return <p className="text-sm text-[var(--md-on-surface-variant)]">{text}</p>;
}

function FunctionItem({ item }: { item: InspectionFunction }): JSX.Element {
  const location = formatFunctionLocation(item);
  return (
    <li data-testid={`entity-function-${item.id}`}>
      <span className="font-medium">{item.label}</span>
      {location.length > 0 ? <span className="text-[var(--md-on-surface-variant)]"> · {location}</span> : null}
    </li>
  );
}

function RelationItem({ relation }: { relation: EntityRelation }): JSX.Element {
  const directionLabel = relation.direction === RELATION_DIRECTION.OUTGOING ? "out" : "in";
  return (
    <li data-testid={`entity-relation-${relation.edgeId}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">{directionLabel}</span>
      {" · "}
      <span>{formatEdgeKind(relation.kind)}</span>
      {" · "}
      <span className="font-medium">{relation.otherLabel}</span>
      {relation.label.length > 0 ? <span className="block text-[var(--md-on-surface-variant)]">{relation.label}</span> : null}
    </li>
  );
}

function PathItem({ steps, index }: { steps: InspectionPathStep[]; index: number }): JSX.Element {
  return <li data-testid={`entity-path-${index}`}>{formatInspectionPath(steps)}</li>;
}
