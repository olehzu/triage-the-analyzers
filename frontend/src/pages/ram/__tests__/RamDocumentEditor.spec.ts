// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import RamDocumentEditor from '../RamDocumentEditor.vue'
import { useUserInfoStore } from '@/stores/userInfo'
import { findDocumentById, findDocumentSectionById, updateDocumentSection } from '@/apis/ram'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { documentId: '7' }, query: {} }),
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('@/apis/ram', () => ({
  findDocumentById: vi.fn(),
  findDocumentSectionById: vi.fn(),
  getDocumentSectionLock: vi.fn(),
  lockDocumentSection: vi.fn(),
  unlockDocumentSection: vi.fn(),
  updateDocumentSection: vi.fn()
}))

const STUDENT_ID = 1
const TEAM_ID = 3

// A rich-text section locked by the current student, so it is editable.
const section = {
  id: 11,
  sectionKey: 'purpose',
  type: 'RICH_TEXT',
  title: 'Purpose',
  content: 'Old text',
  requirementArtifacts: [],
  version: 0,
  lock: { locked: true, documentSectionId: 11, lockedBy: { id: STUDENT_ID, name: 'John Smith' } }
}

// The same section fetched again a moment later, after a teammate saved new content.
// Its content is plain text, which Tiptap's schema wraps in a paragraph when it parses it.
const refreshedSection = { ...section, content: 'Plain text', version: 1 }

describe('RamDocumentEditor', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    setActivePinia(createPinia())
    useUserInfoStore().setUserInfo({ id: STUDENT_ID, roles: 'student', teamId: TEAM_ID } as never)

    vi.mocked(findDocumentById).mockResolvedValue({
      data: { id: 7, type: 'VISION_SCOPE', teamId: TEAM_ID, sections: [section] }
    } as never)
    vi.mocked(findDocumentSectionById).mockResolvedValue({ data: { ...refreshedSection } } as never)
    vi.mocked(updateDocumentSection).mockResolvedValue({ data: { ...refreshedSection } } as never)
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
  })

  // Loading a section into the editor must not count as an edit: the watcher calls
  // setContent(..., false) intending "do not emit an update". If the update fires anyway,
  // onUpdate overwrites draftContent with Tiptap's re-serialized HTML, and saving an
  // untouched section rewrites what is stored. Tiptap emits an update only when the document
  // changes, so the bug shows when the fresh copy of the section differs from the one already
  // in the editor, as it does here.
  it('saves an unedited section with the content the server returned when it was refreshed', async () => {
    wrapper = mount(RamDocumentEditor, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    await flushPromises()

    expect(updateDocumentSection).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(updateDocumentSection).mock.calls[0]!.at(-1) as { content: string }
    expect(payload.content).toBe('Plain text')
  })
})
