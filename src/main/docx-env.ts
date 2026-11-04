import { promises as fs } from 'fs'
import { Packer, type Document } from 'docx'
import type { DocxEnv } from '../shared/docx'

/** بيئة توليد docx داخل عملية Electron الرئيسية (Node). */
export const nodeDocxEnv: DocxEnv = {
  readFile: async (path: string) => new Uint8Array(await fs.readFile(path)),
  pack: async (doc: Document) => new Uint8Array(await Packer.toBuffer(doc))
}
