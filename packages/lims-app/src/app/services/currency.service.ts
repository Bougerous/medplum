import { Injectable } from '@angular/core';
import { Money } from '@medplum/fhirtypes';
import { BehaviorSubject, Observable } from 'rxjs';

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  decimalPlaces: number;
  isDefault: boolean;
}

export interface CurrencyFormatOptions {
  showSymbol?: boolean;
  showCode?: boolean;
  decimalPlaces?: number;
}

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private readonly DEFAULT_CURRENCY = 'INR';
  private readonly SUPPORTED_CURRENCIES: CurrencyConfig[] = [
    {
      code: 'INR',
      symbol: '₹',
      name: 'Indian Rupee',
      decimalPlaces: 2,
      isDefault: true
    },
    {
      code: 'USD',
      symbol: '$',
      name: 'US Dollar',
      decimalPlaces: 2,
      isDefault: false
    },
    {
      code: 'EUR',
      symbol: '€',
      name: 'Euro',
      decimalPlaces: 2,
      isDefault: false
    },
    {
      code: 'GBP',
      symbol: '£',
      name: 'British Pound',
      decimalPlaces: 2,
      isDefault: false
    }
  ];

  private currentCurrency$ = new BehaviorSubject<string>(this.DEFAULT_CURRENCY);

  constructor() {
    // Initialize with default currency
    this.setCurrency(this.DEFAULT_CURRENCY);
  }

  /**
   * Get the current currency code
   * @returns The current currency code
   */
  getCurrentCurrency(): string {
    return this.currentCurrency$.value;
  }

  /**
   * Get the current currency as an observable
   * @returns Observable of the current currency code
   */
  getCurrentCurrency$(): Observable<string> {
    return this.currentCurrency$.asObservable();
  }

  /**
   * Set the current currency
   * @param currencyCode - The currency code to set
   */
  setCurrency(currencyCode: string): void {
    const currency = this.SUPPORTED_CURRENCIES.find(c => c.code === currencyCode);
    if (currency) {
      this.currentCurrency$.next(currencyCode);
    } else {
      console.warn(`Currency ${currencyCode} not supported, using default ${this.DEFAULT_CURRENCY}`);
      this.currentCurrency$.next(this.DEFAULT_CURRENCY);
    }
  }

  /**
   * Get currency configuration for a specific currency
   * @param currencyCode - The currency code to get config for
   * @returns The currency configuration
   */
  getCurrencyConfig(currencyCode?: string): CurrencyConfig {
    const code = currencyCode || this.getCurrentCurrency();
    const currency = this.SUPPORTED_CURRENCIES.find(c => c.code === code);
    if (!currency) {
      throw new Error(`Currency ${code} not supported`);
    }
    return currency;
  }

  /**
   * Get all supported currencies
   * @returns Array of supported currency configurations
   */
  getSupportedCurrencies(): CurrencyConfig[] {
    return [...this.SUPPORTED_CURRENCIES];
  }

  /**
   * Create a Money object with the current currency
   * @param value - The monetary value
   * @param currencyCode - The currency code (optional, uses current currency if not provided)
   * @returns A Money object
   */
  createMoney(value: number, currencyCode?: string): Money {
    const currency = currencyCode || this.getCurrentCurrency();
    return {
      value,
      currency: currency as any
    };
  }

  /**
   * Create a Money object with INR currency
   * @param value - The monetary value
   * @returns A Money object with INR currency
   */
  createINRMoney(value: number): Money {
    return {
      value,
      currency: 'INR' as any
    };
  }

  /**
   * Format a Money object for display
   * @param money - The Money object to format
   * @param options - Formatting options
   * @returns Formatted currency string
   */
  formatMoney(money: Money, options: CurrencyFormatOptions = {}): string {
    if (!money || typeof money.value !== 'number') {
      return '0';
    }

    const config = this.getCurrencyConfig(money.currency);
    const decimalPlaces = options.decimalPlaces ?? config.decimalPlaces;

    let formatted = money.value.toFixed(decimalPlaces);

    // Add thousand separators
    formatted = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // Add currency symbol or code
    if (options.showSymbol) {
      formatted = `${config.symbol}${formatted}`;
    } else if (options.showCode) {
      formatted = `${formatted} ${config.code}`;
    }

    return formatted;
  }

  /**
   * Convert a number to the current currency format
   * @param amount - The amount to format
   * @param currencyCode - The currency code (optional)
   * @param options - Formatting options
   * @returns Formatted currency string
   */
  formatAmount(amount: number, currencyCode?: string, options: CurrencyFormatOptions = {}): string {
    const money = this.createMoney(amount, currencyCode);
    return this.formatMoney(money, options);
  }

  /**
   * Sum multiple Money objects (must be same currency)
   * @param amounts - Array of Money objects to sum
   * @returns Sum of the Money objects
   */
  sumMoney(amounts: Money[]): Money {
    if (amounts.length === 0) {
      return this.createMoney(0);
    }

    const currency = amounts[0].currency;
    const total = amounts.reduce((sum, amount) => {
      if (amount.currency !== currency) {
        throw new Error(`Cannot sum amounts with different currencies: ${currency} and ${amount.currency}`);
      }
      return sum + (amount.value || 0);
    }, 0);

    return this.createMoney(total, currency);
  }

  /**
   * Validate if a currency code is supported
   * @param currencyCode - The currency code to validate
   * @returns True if the currency is supported
   */
  isSupportedCurrency(currencyCode: string): boolean {
    return this.SUPPORTED_CURRENCIES.some(c => c.code === currencyCode);
  }

  /**
   * Get the default currency configuration
   * @returns The default currency configuration
   */
  getDefaultCurrency(): CurrencyConfig {
    return this.SUPPORTED_CURRENCIES.find(c => c.isDefault) || this.SUPPORTED_CURRENCIES[0];
  }
} 