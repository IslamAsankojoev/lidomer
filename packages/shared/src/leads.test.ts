import { describe, expect, it } from 'vitest';
import { isAdUtm, maskPhone, normalizeInstagram, normalizePhone } from './leads';
import { change, costPerLead, percent } from './metrics';

describe('телефоны и Instagram', () => {
  it('приводит кыргызские номера к +996', () => {
    expect(normalizePhone('+996 555 123 456')).toBe('+996555123456');
    expect(normalizePhone('0555123456')).toBe('+996555123456');
    expect(normalizePhone('555 12-34-56')).toBe('+996555123456');
    expect(normalizePhone('996555123456')).toBe('+996555123456');
    expect(normalizePhone('+7 701 123 4567')).toBe('+77011234567');
    expect(normalizePhone('нет')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
  it('Instagram без @ и регистра', () => {
    expect(normalizeInstagram(' @Gulnur_Nail_ ')).toBe('gulnur_nail_');
    expect(normalizeInstagram('')).toBeNull();
  });
  it('маска телефона', () => {
    expect(maskPhone('+996555123456')).toBe('+996 *** *** 456');
  });
});

describe('реклама по UTM', () => {
  it('ig/fb — реклама, organic — нет', () => {
    expect(isAdUtm('ig', 'Ширик 35')).toBe(true);
    expect(isAdUtm('FB', null)).toBe(true);
    expect(isAdUtm('instagram', 'paid')).toBe(true);
    expect(isAdUtm('instagram', 'organic')).toBe(false);
    expect(isAdUtm('google', 'cpc')).toBe(false);
    expect(isAdUtm(null, null)).toBe(false);
  });
});

describe('формулы', () => {
  it('цена за лид: нет расхода или лидов — нет данных, не ноль', () => {
    expect(costPerLead(10000, 4)).toBe(2500);
    expect(costPerLead(null, 4)).toBeNull();
    expect(costPerLead(10000, 0)).toBeNull();
  });
  it('доли и изменение', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(1, 0)).toBeNull();
    expect(change(120, 100)).toBe(20);
    expect(change(5, 0)).toBeNull();
  });
});
