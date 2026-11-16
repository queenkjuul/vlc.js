/**
 * @file How is there no tool for this? Take a C integer enum
 *   (libvlc_event_e) and output a TypeScript const ... as const type
 *   This is accomplished by using clang to dump the AST as JSON and
 *   transforming that back to a TypeScript type.
 */

import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"

const ast = JSON.parse(
  execFileSync(
    "clang",
    [
      "-Xclang",
      "-ast-dump=json",
      "-fsyntax-only",
      "-I",
      "vlc/include",
      "-x",
      "c",
      "vlc/include/vlc/libvlc_events.h",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  ).toString(),
)

function findEnum(node) {
  if (node.kind === "EnumDecl" && node.name === "libvlc_event_e") {
    return node
  }
  for (const child of node.inner ?? []) {
    const found = findEnum(child)
    if (found) return found
  }
  return null
}

const enumNode = findEnum(ast)
const known = Object.create(null)
let next = 0

function evalConst(node, known) {
  switch (node.kind) {
    case "ConstantExpr":
      return evalConst(node.inner[0], known)

    case "IntegerLiteral":
      return Number(node.value)

    case "BinaryOperator": {
      const a = evalConst(node.inner[0], known)
      const b = evalConst(node.inner[1], known)
      switch (node.opcode) {
        case "+":
          return a + b
        case "-":
          return a - b
        case "*":
          return a * b
        case "|":
          return a | b
        case "<<":
          return a << b
        default:
          throw new Error(`Unsupported opcode: ${node.opcode}`)
      }
    }

    // `X = libvlc_Y + 1` → the LHS operand is a DeclRefExpr pointing at a prior member
    case "DeclRefExpr": {
      const name = node.referencedDecl?.name
      if (!name || !(name in known)) {
        throw new Error(
          `Unresolved reference: ${name ?? "<unnamed>"}`,
        )
      }
      return known[name]
    }

    default:
      throw new Error(`Unsupported node kind: ${node.kind}`)
  }
}

const entries = (enumNode.inner ?? [])
  .filter((node) => node.kind === "EnumConstantDecl")
  .map((node) => {
    const initExpr = (node.inner ?? []).find(
      (c) => c.kind === "ConstantExpr",
    )
    if (initExpr) {
      next = evalConst(initExpr, known)
    }
    const entry = {
      name: node.name.replace(/^libvlc_/, ""),
      value: next,
    }
    known[node.name] = next
    next += 1
    return entry
  })

const lines = entries.map(({ name, value }) => {
  return `  ${name}: ${value},`
})

const out = `export const VlcEvent = {
${lines.join("\n")}
} as const
export type VlcEventName = keyof typeof VlcEvent
export type VlcEventValue = typeof VlcEvent[VlcEventName]

export const VlcEventName: Record<number, VlcEventName> = 
  Object.fromEntries(
    Object.entries(VlcEvent).map(([k, v]) => [v, k as VlcEventName])
  ) as Record<number, VlcEventName>
`

writeFileSync("libvlc_events.ts", out)
