export type StatusOption = { main: string; secondary: string; label: string };

/**
 * Parse one.prat GetAllFilterStatuses payload.
 * Shape (from Flask/report.js): { primaries: [{ statusCode, statusDescription, isEmergency, secondaries: [...] }] }
 * Also tolerates wrapped { statuses: ... } / { ok, statuses } and alternate field names.
 */
export function flattenStatuses(raw: unknown): StatusOption[] {
  const out: StatusOption[] = [];

  let root: unknown = raw;
  if (root && typeof root === "object") {
    const obj = root as Record<string, unknown>;
    if (obj.statuses !== undefined) root = obj.statuses;
    else if (obj.data !== undefined && !obj.primaries) root = obj.data;
  }

  let primaries: unknown[] = [];
  if (Array.isArray(root)) {
    primaries = root;
  } else if (root && typeof root === "object") {
    const obj = root as Record<string, unknown>;
    if (Array.isArray(obj.primaries)) primaries = obj.primaries;
    else if (Array.isArray(obj.statuses)) primaries = obj.statuses;
    else if (Array.isArray(obj.result)) primaries = obj.result;
  }

  for (const p of primaries) {
    if (!p || typeof p !== "object") continue;
    const primary = p as Record<string, unknown>;
    if (primary.isEmergency) continue;

    const main = String(
      primary.statusCode ?? primary.mainCode ?? primary.code ?? "",
    ).trim();
    const mainName = String(
      primary.statusDescription ?? primary.mainName ?? primary.name ?? "",
    ).trim();
    if (!main) continue;

    const secs =
      (Array.isArray(primary.secondaries) && primary.secondaries) ||
      (Array.isArray(primary.secondaryStatuses) && primary.secondaryStatuses) ||
      (Array.isArray(primary.children) && primary.children) ||
      [];

    if (secs.length === 0) {
      out.push({
        main,
        secondary: "0",
        label: mainName || main,
      });
      continue;
    }

    for (const s of secs) {
      if (!s || typeof s !== "object") continue;
      const sec = s as Record<string, unknown>;
      const secondary = String(
        sec.statusCode ?? sec.secondaryCode ?? sec.code ?? "0",
      ).trim();
      const secName = String(
        sec.statusDescription ?? sec.secondaryName ?? sec.name ?? "",
      ).trim();
      out.push({
        main,
        secondary: secondary || "0",
        label: secName ? `${mainName || main} · ${secName}` : mainName || main,
      });
    }
  }

  // Fallback: walk arbitrary trees with mainCode/name (legacy)
  if (out.length === 0 && root && typeof root === "object") {
    const walk = (node: unknown) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node !== "object") return;
      const item = node as Record<string, unknown>;
      const main = String(item.mainCode ?? item.code ?? item.statusCode ?? "");
      const name = String(item.mainName ?? item.name ?? item.statusDescription ?? "");
      if (main && name) out.push({ main, secondary: "0", label: name });
      walk(item.secondaryStatuses || item.statuses || item.children || item.secondaries);
    };
    walk(root);
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    const key = `${x.main}:${x.secondary}:${x.label}`;
    if (seen.has(key) || !x.main) return false;
    seen.add(key);
    return true;
  });
}

/** Prefer in-base status code 01 when present. */
export function pickDefaultStatus(options: StatusOption[]): StatusOption | undefined {
  return options.find((o) => o.main === "01" || o.main === "1") || options[0];
}
