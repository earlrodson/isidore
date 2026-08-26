"use client";

import { useMemo, useState } from "react";
import { EnvironmentSchema, FeatureStatusSchema, PrioritySchema, SeveritySchema } from "@isidore/shared";
import type { ProjectDetailFeature } from "@isidore/db";
import { formatHours } from "@/lib/format";
import { isStatusStale } from "@/lib/feature-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ALL = "all";
const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function statusBadgeVariant(status: string): "success" | "destructive" | "secondary" {
  if (status === "done") return "success";
  if (status === "blocked") return "destructive";
  return "secondary";
}

/** Earliest non-null todo `due` date — stands in for a feature-level target
 * date, since features carry no such column of their own. */
function targetDate(feature: ProjectDetailFeature): string | null {
  const dueDates = feature.todos.map((todo) => todo.due).filter((due): due is string => due !== null);
  return dueDates.length === 0 ? null : dueDates.sort()[0];
}

function inRange(date: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (date === null) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

interface FeatureFiltersProps {
  features: ProjectDetailFeature[];
}

export function FeatureFilters({ features }: FeatureFiltersProps) {
  const [status, setStatus] = useState(ALL);
  const [environment, setEnvironment] = useState(ALL);
  const [severity, setSeverity] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [owner, setOwner] = useState(ALL);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [targetFrom, setTargetFrom] = useState("");
  const [targetTo, setTargetTo] = useState("");

  const owners = useMemo(
    () => Array.from(new Set(features.flatMap((feature) => feature.owners))).sort(),
    [features],
  );

  const filtered = useMemo(() => {
    return features.filter((feature) => {
      if (status !== ALL && feature.status !== status) return false;
      if (environment !== ALL && feature.environment !== environment) return false;
      if (severity !== ALL && feature.severity !== severity) return false;
      if (priority !== ALL && feature.priority !== priority) return false;
      if (owner !== ALL && !feature.owners.includes(owner)) return false;
      const createdOn = feature.createdAt.toISOString().slice(0, 10);
      if (!inRange(createdOn, createdFrom, createdTo)) return false;
      if (!inRange(targetDate(feature), targetFrom, targetTo)) return false;
      return true;
    });
  }, [
    features,
    status,
    environment,
    severity,
    priority,
    owner,
    createdFrom,
    createdTo,
    targetFrom,
    targetTo,
  ]);

  return (
    <div className="mb-10 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-8">
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-status">Status</Label>
          <select
            id="filter-status"
            className={selectClassName}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value={ALL}>All</option>
            {FeatureStatusSchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-environment">Environment</Label>
          <select
            id="filter-environment"
            className={selectClassName}
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
          >
            <option value={ALL}>All</option>
            {EnvironmentSchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-severity">Severity</Label>
          <select
            id="filter-severity"
            className={selectClassName}
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          >
            <option value={ALL}>All</option>
            {SeveritySchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-priority">Priority</Label>
          <select
            id="filter-priority"
            className={selectClassName}
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value={ALL}>All</option>
            {PrioritySchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-owner">Assigned to</Label>
          <select
            id="filter-owner"
            className={selectClassName}
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <option value={ALL}>All</option>
            {owners.map((handle) => (
              <option key={handle} value={handle}>
                {handle}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-created-from">Created from</Label>
          <Input
            id="filter-created-from"
            type="date"
            value={createdFrom}
            onChange={(event) => setCreatedFrom(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-created-to">Created to</Label>
          <Input
            id="filter-created-to"
            type="date"
            value={createdTo}
            onChange={(event) => setCreatedTo(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 sm:col-span-1">
          <Label htmlFor="filter-target-from">Target from</Label>
          <Input
            id="filter-target-from"
            type="date"
            value={targetFrom}
            onChange={(event) => setTargetFrom(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-target-to">Target to</Label>
          <Input
            id="filter-target-to"
            type="date"
            value={targetTo}
            onChange={(event) => setTargetTo(event.target.value)}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} of {features.length} features
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No features match these filters.</p>
      ) : (
        filtered.map((feature) => (
          <Card key={feature.featureId}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {feature.type && <Badge variant="outline">{feature.type}</Badge>}
                <span>{feature.title}</span>
                <Badge variant={statusBadgeVariant(feature.status)}>{feature.status}</Badge>
                {isStatusStale(feature) && (
                  <Badge variant="destructive" title="Every todo is done but status was never bumped forward">
                    status stale
                  </Badge>
                )}
                <Badge variant="secondary">{feature.environment ?? "unknown"}</Badge>
                {feature.severity && <Badge variant="destructive">{feature.severity}</Badge>}
                {feature.priority && <Badge variant="outline">{feature.priority}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">
                Hours logged: {formatHours(feature.hoursLogged)} / {formatHours(feature.estimateHours)}
              </p>
              <p className="text-muted-foreground">
                Open PRs: {Array.isArray(feature.openPrs) ? feature.openPrs.length : 0}
              </p>
              {feature.owners.length > 0 ? (
                <p className="text-muted-foreground">Owners: {feature.owners.join(", ")}</p>
              ) : null}
              {Array.isArray(feature.relatesTo) && feature.relatesTo.length > 0 ? (
                <p className="text-muted-foreground">
                  Relates to: {(feature.relatesTo as string[]).join(", ")}
                </p>
              ) : null}
              <ul className="flex flex-col gap-1">
                {feature.todos.map((todo) => (
                  <li key={todo.todoId} className="flex items-center gap-2">
                    <input type="checkbox" checked={todo.done} readOnly className="accent-primary" />
                    <span className={todo.done ? "text-muted-foreground line-through" : undefined}>
                      {todo.title} (@{todo.owner}
                      {todo.due ? `, due ${todo.due}` : ""})
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
