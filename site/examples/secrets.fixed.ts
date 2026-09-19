interface Req { headers: Record<string, string>; url: string }
declare function next(req: Req): unknown;

export function logRequest(req: Req) {
  console.log("request", req.url);
  return next(req);
}
