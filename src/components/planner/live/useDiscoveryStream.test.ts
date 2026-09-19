import { test } from "node:test"
import assert from "node:assert/strict"
import { parseSse } from "./useDiscoveryStream"

test("parseSse handles named frames and repeated data lines", () => {
  const frames: Array<[string, string]> = []
  const remainder = parseSse("event: progress\nid: 1\ndata: {\"a\":\ndata: 1}\n\nevent: complete\ndata: {}\n\npartial", (name, data) => frames.push([name, data]))
  assert.deepEqual(frames, [["progress", '{"a":\n1}'], ["complete", "{}"]])
  assert.equal(remainder, "partial")
})

test("parseSse defaults unnamed frames to message", () => {
  const frames: Array<[string, string]> = []
  parseSse("data: hello\n\n", (name, data) => frames.push([name, data]))
  assert.deepEqual(frames, [["message", "hello"]])
})
