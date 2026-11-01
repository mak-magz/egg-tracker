import { describe, expect, it } from 'vitest'
import { SIZE_COPY } from '../../app/utils/size-copy'

describe('SIZE_COPY (feature 02 §2.5 "Copy")', () => {
  it('provides edit action label alongside rename backward-compatibility', () => {
    expect(SIZE_COPY.edit).toBe('Edit')
    expect(SIZE_COPY.rename).toBe('Edit')
  })

  it('provides editHelp and renameHelp copy', () => {
    expect(SIZE_COPY.editHelp).toBe('Past days will show this new name too.')
    expect(SIZE_COPY.renameHelp).toBe('Past days will show this new name too.')
  })

  it('formats toasts accurately for rename vs update', () => {
    expect(SIZE_COPY.toastRenamed('Small', 'Peewee')).toBe('Renamed Small to Peewee')
    expect(SIZE_COPY.toastUpdated('Small')).toBe('Updated Small')
    expect(SIZE_COPY.toastAdded('Jumbo')).toBe('Added Jumbo')
    expect(SIZE_COPY.toastArchived('Small')).toBe('Archived Small')
    expect(SIZE_COPY.toastMovedUp('Small')).toBe('Moved Small up')
    expect(SIZE_COPY.toastMovedDown('Small')).toBe('Moved Small down')
  })
})
