interface Req { headers: Record<string, string>; url: string }
declare function next(req: Req): unknown;

export function logRequest(req: Req) {
  const key = req.headers.authorization;
  console.log("auth", key);
  return next(req);
}
