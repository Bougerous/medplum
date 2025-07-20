import { TestBed } from '@angular/core/testing';
import { CurrencyService } from './currency.service';

describe('CurrencyService', () => {
  let service: CurrencyService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CurrencyService]
    });
    service = TestBed.inject(CurrencyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should default to INR currency', () => {
    expect(service.getCurrentCurrency()).toBe('INR');
  });

  it('should create INR money objects', () => {
    const money = service.createINRMoney(100.50);
    expect(money.value).toBe(100.50);
    expect(money.currency).toBe('INR');
  });

  it('should format money with INR symbol', () => {
    const money = service.createINRMoney(1234.56);
    const formatted = service.formatMoney(money, { showSymbol: true });
    expect(formatted).toBe('₹1,234.56');
  });

  it('should format money with INR code', () => {
    const money = service.createINRMoney(1234.56);
    const formatted = service.formatMoney(money, { showCode: true });
    expect(formatted).toBe('1,234.56 INR');
  });

  it('should support multiple currencies', () => {
    const currencies = service.getSupportedCurrencies();
    expect(currencies.length).toBeGreaterThan(1);
    expect(currencies.some(c => c.code === 'INR')).toBe(true);
    expect(currencies.some(c => c.code === 'USD')).toBe(true);
  });

  it('should validate supported currencies', () => {
    expect(service.isSupportedCurrency('INR')).toBe(true);
    expect(service.isSupportedCurrency('USD')).toBe(true);
    expect(service.isSupportedCurrency('XYZ')).toBe(false);
  });

  it('should sum money objects with same currency', () => {
    const amounts = [
      service.createINRMoney(100),
      service.createINRMoney(200),
      service.createINRMoney(300)
    ];
    const total = service.sumMoney(amounts);
    expect(total.value).toBe(600);
    expect(total.currency).toBe('INR');
  });

  it('should get default currency configuration', () => {
    const defaultCurrency = service.getDefaultCurrency();
    expect(defaultCurrency.code).toBe('INR');
    expect(defaultCurrency.isDefault).toBe(true);
  });
}); 