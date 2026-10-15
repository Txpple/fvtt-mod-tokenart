// Ambient globals for the type checker: what Foundry and dnd5e put on `window`, typed `any`.
// The shipped code carries no type package for either; a file that opts in with `// @ts-check`
// gets its own logic checked and the platform left open. Not shipped (tsconfig.json `include`).

declare const game: any;
declare const ui: any;
declare const canvas: any;
declare const Hooks: any;
declare const CONFIG: any;
declare const CONST: any;
declare const foundry: any;
declare const dnd5e: any;
declare const Actor: any;
declare const Item: any;
declare const ActiveEffect: any;
declare const ChatMessage: any;
declare const Combat: any;
declare const Combatant: any;
declare const Token: any;
declare const TokenDocument: any;
declare const Scene: any;
declare const fromUuid: any;
declare const fromUuidSync: any;
declare function srcExists(src: string): Promise<boolean>;
