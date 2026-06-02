import { describe, expect, it } from "vitest";

import {
  CONVERSION_ENDPOINTS,
  CONVERSION_MATRIX,
  ENDPOINT_NAMES,
  EXTENSION_TO_ENDPOINT,
} from "@app/constants/convertConstants";

// Cross-registry consistency guards. These three registries are maintained by hand and reference
// each other by string, so a typo or a forgotten entry silently breaks a conversion (a dangling
// endpoint name 404s; divergent key sets desync the URL lookup from the public name lookup).
describe("convert endpoint registries", () => {
  it("CONVERSION_ENDPOINTS and ENDPOINT_NAMES share the same internal endpoint ids", () => {
    expect(Object.keys(CONVERSION_ENDPOINTS).sort()).toEqual(
      Object.keys(ENDPOINT_NAMES).sort(),
    );
  });

  it("every CONVERSION_ENDPOINTS value is a convert API path", () => {
    for (const path of Object.values(CONVERSION_ENDPOINTS)) {
      expect(path.startsWith("/api/v1/convert/")).toBe(true);
    }
  });

  it("public endpoint names are unique (no two internal ids collide on a name)", () => {
    const names = Object.values(ENDPOINT_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every endpoint referenced by EXTENSION_TO_ENDPOINT is a known public endpoint name", () => {
    const known = new Set<string>(Object.values(ENDPOINT_NAMES));
    const dangling: string[] = [];
    for (const [from, targets] of Object.entries(EXTENSION_TO_ENDPOINT)) {
      for (const [to, endpoint] of Object.entries(targets)) {
        if (!known.has(endpoint)) {
          dangling.push(`${from}->${to} => ${endpoint}`);
        }
      }
    }
    // Any entry here points at an endpoint name with no registered URL/display mapping.
    expect(dangling).toEqual([]);
  });

  it("every EXTENSION_TO_ENDPOINT source has at least one target conversion", () => {
    const empty: string[] = [];
    for (const [from, targets] of Object.entries(EXTENSION_TO_ENDPOINT)) {
      if (Object.keys(targets).length === 0) {
        empty.push(from);
      }
    }
    expect(empty).toEqual([]);
  });
});

// The UI offers conversions from CONVERSION_MATRIX; each offered (from -> to) must actually be
// routable via EXTENSION_TO_ENDPOINT, or the user picks a conversion that has no backend endpoint.
describe("CONVERSION_MATRIX routability", () => {
  it("every offered (from -> to) conversion has an EXTENSION_TO_ENDPOINT route", () => {
    const unroutable: string[] = [];
    for (const [from, targets] of Object.entries(CONVERSION_MATRIX)) {
      const routes = EXTENSION_TO_ENDPOINT[from];
      for (const to of targets) {
        if (!routes || !(to in routes)) {
          unroutable.push(`${from} -> ${to}`);
        }
      }
    }
    expect(unroutable).toEqual([]);
  });

  it("every CONVERSION_MATRIX source offers at least one target format", () => {
    const empty: string[] = [];
    for (const [from, targets] of Object.entries(CONVERSION_MATRIX)) {
      if (targets.length === 0) {
        empty.push(from);
      }
    }
    expect(empty).toEqual([]);
  });

  it("no CONVERSION_MATRIX target list contains duplicate formats", () => {
    const dupes: string[] = [];
    for (const [from, targets] of Object.entries(CONVERSION_MATRIX)) {
      if (new Set(targets).size !== targets.length) {
        dupes.push(from);
      }
    }
    expect(dupes).toEqual([]);
  });
});
