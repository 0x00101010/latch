/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `latch-todo` command */
  export type LatchTodo = ExtensionPreferences & {}
  /** Preferences accessible in the `my-tasks` command */
  export type MyTasks = ExtensionPreferences & {}
  /** Preferences accessible in the `triage-inbox` command */
  export type TriageInbox = ExtensionPreferences & {}
  /** Preferences accessible in the `search-knowledge` command */
  export type SearchKnowledge = ExtensionPreferences & {}
  /** Preferences accessible in the `reindex` command */
  export type Reindex = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `latch-todo` command */
  export type LatchTodo = {
  /** What needs to be done? */
  "task": string
}
  /** Arguments passed to the `my-tasks` command */
  export type MyTasks = {}
  /** Arguments passed to the `triage-inbox` command */
  export type TriageInbox = {}
  /** Arguments passed to the `search-knowledge` command */
  export type SearchKnowledge = {}
  /** Arguments passed to the `reindex` command */
  export type Reindex = {}
}

