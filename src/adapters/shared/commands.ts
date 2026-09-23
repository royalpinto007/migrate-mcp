export interface FrameworkCommand {
  executable: string;
  args: string[];
}

export function npxCommand(args: string[]): FrameworkCommand {
  return { executable: "npx", args: ["--no-install", ...args] };
}
