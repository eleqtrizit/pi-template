import {
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

/**
 * Default export — the entry point pi loads. Synchronous or async factories both work;
 * an async factory is awaited before session_start fires.
 *
 * ExtensionAPI gives you:
 * - pi.registerTool()   Custom tools the LLM can call
 * - pi.on()             Events (session_start, tool_call, turn_end, ...)
 * - pi.registerCommand / registerShortcut / registerFlag
 * - pi.sendUserMessage / appendEntry / setSessionName ...
 *
 * Every handler and tool execute() receives a ctx (ExtensionContext):
 * - ctx.ui              notify / setStatus / setWidget / select / confirm / input / editor
 * - ctx.sessionManager  read-only session state
 * - ctx.cwd, ctx.mode, ctx.hasUI, ctx.signal, ctx.isIdle(), ctx.compact() ...
 */

// -- Tool parameter schemas (typebox). Export Static types for typed tool_call narrowing.
const HelloParams = Type.Object({
  name: Type.String({ description: "Name to greet" }),
});

const EchoParams = Type.Object({
  message: Type.String(),
  times: Type.Number({
    description: "How many times to repeat",
    default: 1,
    minimum: 1,
    maximum: 10,
  }),
});

export type HelloToolInput = Static<typeof HelloParams>;
export type EchoToolInput = Static<typeof EchoParams>;

export default function (pi: ExtensionAPI) {
  // ---- Events -------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    // event.reason: "startup" | "reload" | "new" | "resume" | "fork"
    ctx.ui.notify("Template extension loaded", "info");
    ctx.ui.setStatus("template", "ready");
  });

  pi.on("session_shutdown", async (event, ctx) => {
    // Clean up any session-scoped resources started in session_start.
    ctx.ui.setStatus("template", undefined);
  });

  // Intercept tool calls: mutate event.input in place, or block with a reason.
  // Use isToolCallEventType to narrow and get typed input.
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("bash", event)) {
      // event.input is { command: string; timeout?: number }
      if (event.input.command.includes("sleep infinity")) {
        return { block: true, reason: "Blocked by template extension" };
      }
    }
    // Narrow custom tools: isToolCallEventType<"echo", EchoToolInput>("echo", event)
  });

  // ---- Custom tools --------------------------------------------------------

  pi.registerTool({
    name: "hello_world",
    label: "Hello World",
    description: "Greet someone by name.",
    parameters: HelloParams,
    async execute(
      toolCallId,
      params: HelloToolInput,
      signal,
      onUpdate,
      ctx: ExtensionContext,
    ) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: { name: params.name },
      };
    },
  });

  pi.registerTool({
    name: "echo",
    label: "Echo",
    description: "Echo the input message back, optionally repeated.",
    parameters: EchoParams,
    // optional: hide from the LLM until toggled active
    // optional: true,
    async execute(_toolCallId, params: EchoToolInput, signal, onUpdate, ctx) {
      // Abort-aware async work:
      //   const res = await fetch(url, { signal });
      return {
        content: [
          {
            type: "text",
            text: Array(params.times).fill(params.message).join(" "),
          },
        ],
        details: {},
      };
    },
  });

  // ---- Commands / shortcuts / flags ---------------------------------------

  pi.registerCommand("template", {
    description: "Show template extension info",
    handler: async (args, ctx) => {
      ctx.ui.notify(
        `/template ${args} — commands get ExtensionCommandContext`,
        "info",
      );
      // Command-only ctx additions: ctx.waitForIdle(), ctx.newSession(), ctx.fork(),
      // ctx.switchSession(), ctx.navigateTree(), ctx.reload()
    },
  });
}
