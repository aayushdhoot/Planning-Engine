// The employee picker holds 182 people. Filtering is the whole reason the control exists, so
// it is tested against the way people actually search: surname, role, part-words, any order.
import { describe, expect, it } from 'vitest';
import { filterOptions, type SearchOption } from '../src/ui/SearchSelect';

const people: SearchOption[] = [
  { value: '1', label: 'Mohammed Sabir A', hint: 'Project Manager · Operations' },
  { value: '2', label: 'Mukul Shivhare', hint: 'Senior Project Manager · Operations' },
  { value: '3', label: 'Shagun Gupta', hint: 'Deputy General Manager - Design · Design' },
  { value: '4', label: 'Shubham Goyal', hint: 'Deputy General Manager - Operations · Operations' },
  { value: '5', label: 'Divyani Chogale', hint: 'Senior Interior Designer · Design' },
];

describe('filterOptions', () => {
  it('returns everything for an empty query', () => {
    expect(filterOptions(people, '')).toHaveLength(5);
    expect(filterOptions(people, '   ')).toHaveLength(5);
  });

  it('matches on the name', () => {
    expect(filterOptions(people, 'shubham').map((o) => o.value)).toEqual(['4']);
  });

  it('matches on the hint, so you can search by role', () => {
    expect(filterOptions(people, 'interior designer').map((o) => o.value)).toEqual(['5']);
  });

  it('requires every word but not their order — "sabir project" finds the project manager', () => {
    expect(filterOptions(people, 'sabir project').map((o) => o.value)).toEqual(['1']);
    expect(filterOptions(people, 'project sabir').map((o) => o.value)).toEqual(['1']);
  });

  it('narrows across name and department together', () => {
    expect(filterOptions(people, 'manager design').map((o) => o.value)).toEqual(['3']);
  });

  it('is case-insensitive and matches inside words', () => {
    expect(filterOptions(people, 'SHIV').map((o) => o.value)).toEqual(['2']);
    expect(filterOptions(people, 'goyal').map((o) => o.value)).toEqual(['4']);
  });

  it('returns nothing rather than everything when there is no match', () => {
    expect(filterOptions(people, 'zzz')).toEqual([]);
  });

  it('copes with an option that has no hint', () => {
    expect(filterOptions([{ value: 'x', label: 'Solo' }], 'solo')).toHaveLength(1);
    expect(filterOptions([{ value: 'x', label: 'Solo' }], 'manager')).toHaveLength(0);
  });
});
