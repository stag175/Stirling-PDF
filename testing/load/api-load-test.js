// Roadmap F1 — concurrent-request load harness for Stirling-PDF.
//
// This is a ready-to-run k6 script (https://k6.io). It needs a *running* Stirling-PDF instance and
// a load-generation host to execute — it is the harness, not a result. Run it against a deployed
// instance:
//
//   BASE_URL=http://localhost:8080 k6 run testing/load/api-load-test.js
//
// Tunables (env vars): BASE_URL, ENDPOINT (default /api/v1/info/status — a lightweight GET status
// endpoint), VUS (peak virtual users), RAMP, HOLD durations.
//
//   VUS=200 HOLD=5m BASE_URL=https://staging.example.com k6 run testing/load/api-load-test.js
//
// Pairs with the streaming work (C3) and the 100 GB+ goal: the GET scenario validates that the app
// stays responsive under concurrency; the commented `merge` scenario below is the template for
// stressing a heavy SISO endpoint with a real multipart upload once a large fixture + rig exist.

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const ENDPOINT = __ENV.ENDPOINT || "/api/v1/info/status";
const PEAK_VUS = Number(__ENV.VUS || 50);

const errorRate = new Rate("stirling_errors");
const statusLatency = new Trend("stirling_status_latency", true);

export const options = {
  scenarios: {
    steady_concurrency: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP || "30s", target: PEAK_VUS },
        { duration: __ENV.HOLD || "1m", target: PEAK_VUS },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    // The run FAILS (non-zero exit) if these regress — making this usable as a CI/perf gate.
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    stirling_errors: ["rate<0.01"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}${ENDPOINT}`, {
    headers: { Accept: "application/json" },
    tags: { name: "status" },
  });
  const ok = check(res, {
    "status is 2xx/3xx": (r) => r.status >= 200 && r.status < 400,
  });
  errorRate.add(!ok);
  statusLatency.add(res.timings.duration);
  sleep(1);
}

// --- Template: heavy SISO endpoint stress (uncomment + supply a fixture) -------------------------
//
// import { open } from "k6";
// const pdf = open("./fixtures/sample.pdf", "b"); // binary fixture (kept out of the harness file)
//
// export function mergeLoad() {
//   const res = http.post(`${BASE_URL}/api/v1/general/merge-pdfs`, {
//     fileInput: http.file(pdf, "a.pdf", "application/pdf"),
//   });
//   check(res, { "merge 200": (r) => r.status === 200 });
// }
//
// Add a second scenario in `options.scenarios` (e.g. constant-arrival-rate) pointing `exec:
// "mergeLoad"` to drive the conversion pipeline under concurrency. This is where the C3 streaming
// changes should be validated at the 100 GB+ / many-concurrent-request target.
