import { describe, expect, it } from 'vitest'
import {
  clientInitials,
  clientMatchesFilters,
  compareClients,
  filterClients,
  foldForSearch,
} from '../../shared/utils/client-list'
import type { ClientFilters } from '../../shared/utils/client-list'
import type { Client } from '../../shared/types/api'

function client(id: string, name: string, active = true): Client {
  return { id, name, phone: null, defaultPrice: null, active, version: 1 }
}

const ALL: ClientFilters = { search: '', status: 'all' }

const SAMPLE = [
  client('1', 'Maple Street Market'),
  client('2', 'The Green Table Café'),
  client('3', 'Linda Ferris'),
  client('4', 'Oakhill Bakery', false),
  client('5', 'Sam & Dana Coyle'),
]

describe('foldForSearch', () => {
  it('lower-cases and drops accents', () => {
    expect(foldForSearch('The Green Table Café')).toBe('the green table cafe')
    expect(foldForSearch('ÉMILE Ñandú')).toBe('emile nandu')
  })

  it('folds decomposed and composed accents the same way', () => {
    expect(foldForSearch('Café')).toBe(foldForSearch('Café'))
  })

  it('keeps punctuation and spaces', () => {
    expect(foldForSearch('Sam & Dana')).toBe('sam & dana')
  })
})

describe('compareClients', () => {
  const sorted = (names: string[]) => names.map((n, i) => client(String(i), n)).sort(compareClients).map(c => c.name)

  it('sorts A to Z ignoring case', () => {
    expect(sorted(['bravo', 'Alpha', 'charlie', 'Bravo2'])).toEqual(['Alpha', 'bravo', 'Bravo2', 'charlie'])
  })

  it('puts accented letters with their plain letter ("Émile" among the E\'s)', () => {
    expect(sorted(['Zed', 'Émile', 'Ed', 'Eve', 'Fay'])).toEqual(['Ed', 'Émile', 'Eve', 'Fay', 'Zed'])
  })

  it('sorts "The Green Table Café" under T', () => {
    expect(sorted(SAMPLE.map(c => c.name))).toEqual([
      'Linda Ferris',
      'Maple Street Market',
      'Oakhill Bakery',
      'Sam & Dana Coyle',
      'The Green Table Café',
    ])
  })

  it('orders "Cafe" then "Café" (different names), whichever comes first in the input', () => {
    expect(sorted(['Café', 'Cafe'])).toEqual(['Cafe', 'Café'])
    expect(sorted(['Cafe', 'Café'])).toEqual(['Cafe', 'Café'])
  })

  it('breaks an exact tie by id, so the order is total', () => {
    const a = client('a', 'Same')
    const b = client('b', 'Same')
    expect(compareClients(a, b)).toBeLessThan(0)
    expect(compareClients(b, a)).toBeGreaterThan(0)
    expect(compareClients(a, a)).toBe(0)
  })

  it('does not ignore punctuation and has no numeric collation', () => {
    expect(sorted(['Store 10', 'Store 9'])).toEqual(['Store 10', 'Store 9'])
    expect(sorted(['AB', 'A B', 'A-B']).indexOf('AB')).toBe(2) // punctuation and space sort before letters, not skipped
  })

  it('is idempotent and independent of the input order', () => {
    const names = SAMPLE.map(c => c.name)
    const once = sorted(names)
    expect(sorted(once)).toEqual(once)
    expect(sorted([...names].reverse())).toEqual(once)
  })
})

describe('filterClients', () => {
  const names = (search: string, status: ClientFilters['status'] = 'all') =>
    filterClients(SAMPLE, { search, status }).map(c => c.name)

  it('a blank search or only spaces shows everything', () => {
    expect(names('')).toHaveLength(5)
    expect(names('    ')).toHaveLength(5)
  })

  it('matches any part of the name, ignoring case and accents', () => {
    expect(names('cafe')).toEqual(['The Green Table Café'])
    expect(names('CAFÉ')).toEqual(['The Green Table Café'])
    expect(names('table')).toEqual(['The Green Table Café'])
    expect(names('street mark')).toEqual(['Maple Street Market'])
    expect(names('& dana')).toEqual(['Sam & Dana Coyle'])
  })

  it('ignores leading and trailing spaces, and collapses inner spaces in the query', () => {
    expect(names('  cafe  ')).toEqual(['The Green Table Café'])
    expect(names('green    table')).toEqual(['The Green Table Café'])
  })

  it('shows nothing that does not match', () => {
    expect(names('zzz')).toEqual([])
  })

  it('does not search the phone or the price', () => {
    const c = { ...client('9', 'Plain'), phone: '(555) 201-3348', defaultPrice: 250 }
    expect(filterClients([c], { search: '555', status: 'all' })).toEqual([])
  })

  it('combines with the status filter', () => {
    expect(names('', 'active')).toHaveLength(4)
    expect(names('', 'inactive')).toEqual(['Oakhill Bakery'])
    expect(names('oak', 'active')).toEqual([])
    expect(names('oak', 'inactive')).toEqual(['Oakhill Bakery'])
    expect(names('a', 'inactive')).toEqual(['Oakhill Bakery'])
  })

  it('keeps the order it was given and does not change the input', () => {
    const input = [...SAMPLE]
    const result = filterClients(input, { search: 'a', status: 'all' })
    expect(result.map(c => c.id)).toEqual(SAMPLE.filter(c => foldForSearch(c.name).includes('a')).map(c => c.id))
    expect(input).toEqual(SAMPLE)
  })

  it('returns the same objects (generic over the row type)', () => {
    expect(filterClients(SAMPLE, ALL)[0]).toBe(SAMPLE[0])
  })
})

describe('clientMatchesFilters', () => {
  it('answers "would this filter hide it" the same as filterClients', () => {
    for (const search of ['', 'cafe', 'oak', 'zzz', '  MAPLE ']) {
      for (const status of ['all', 'active', 'inactive'] as const) {
        const filters = { search, status }
        for (const c of SAMPLE) {
          expect(clientMatchesFilters(c, filters), `${c.name}|${search}|${status}`).toBe(filterClients([c], filters).length === 1)
        }
      }
    }
  })

  it('hides an inactive client under the Active filter', () => {
    expect(clientMatchesFilters(client('4', 'Oakhill Bakery', false), { search: '', status: 'active' })).toBe(false)
    expect(clientMatchesFilters(client('4', 'Oakhill Bakery', false), { search: '', status: 'inactive' })).toBe(true)
  })
})

describe('clientInitials', () => {
  it('takes the first letter of the first two words, skipping a lone symbol', () => {
    expect(clientInitials('Sam & Dana Coyle')).toBe('SD')
    expect(clientInitials('Maple Street Market')).toBe('MS')
    expect(clientInitials('Linda Ferris')).toBe('LF')
  })

  it('handles one word, digits, accents and lower case', () => {
    expect(clientInitials('Oakhill')).toBe('O')
    expect(clientInitials('7 Eleven')).toBe('7E')
    expect(clientInitials('émile roy')).toBe('ÉR')
  })

  it('is empty when no word starts with a letter or digit', () => {
    expect(clientInitials('& - !')).toBe('')
    expect(clientInitials('')).toBe('')
  })
})
