export function nowTime(): string {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function fmt(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}
