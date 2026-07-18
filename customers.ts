import { supabase } from '../lib/supabase';

export interface RestaurantCustomer {
  id: string;
  restaurant_id: string;
  customer_key: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  marketing_opt_in: boolean;
  source: 'reservation' | 'csv_import' | 'manual';
  visit_count: number;
  total_guests: number;
  first_visit_at: string | null;
  last_visit_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerImportRow {
  name: string;
  email: string;
  phone: string;
  notes: string;
  marketing_opt_in: boolean;
}

export interface CustomerImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

const HEADER_ALIASES: Record<keyof CustomerImportRow, string[]> = {
  name: ['name', 'customer name', 'full name', 'fullname'],
  email: ['email', 'email address', 'e-mail'],
  phone: ['phone', 'phone number', 'telephone', 'mobile', 'mobile number'],
  notes: ['notes', 'note', 'comments', 'comment'],
  marketing_opt_in: ['marketing opt in', 'marketing opt-in', 'marketing consent', 'consent', 'opt in'],
};

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function parseBoolean(value: string) {
  return ['true', 'yes', 'y', '1', 'opted in', 'subscribed'].includes(value.trim().toLowerCase());
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

export function parseCustomerCsv(text: string): CustomerImportRow[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('The CSV must include a header row and at least one customer.');

  const headers = rows[0].map(normaliseHeader);
  const columnIndex = {} as Record<keyof CustomerImportRow, number>;

  (Object.keys(HEADER_ALIASES) as (keyof CustomerImportRow)[]).forEach(key => {
    columnIndex[key] = headers.findIndex(header => HEADER_ALIASES[key].includes(header));
  });

  if (columnIndex.name < 0) throw new Error('The CSV needs a “name” or “customer name” column.');
  if (columnIndex.email < 0 && columnIndex.phone < 0) {
    throw new Error('The CSV needs an email or phone column so customers can be matched safely.');
  }

  return rows.slice(1).map((values, index) => {
    const get = (key: keyof CustomerImportRow) => {
      const position = columnIndex[key];
      return position >= 0 ? (values[position] || '').trim() : '';
    };
    const row = {
      name: get('name'),
      email: get('email').toLowerCase(),
      phone: get('phone'),
      notes: get('notes'),
      marketing_opt_in: parseBoolean(get('marketing_opt_in')),
    };
    if (!row.name) throw new Error(`Row ${index + 2} is missing a customer name.`);
    if (!row.email && !row.phone) throw new Error(`Row ${index + 2} needs an email or phone number.`);
    return row;
  });
}

export async function getRestaurantCustomers(restaurantId: string): Promise<RestaurantCustomer[]> {
  const { data, error } = await supabase
    .from('restaurant_customers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('last_visit_at', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as RestaurantCustomer[];
}

export async function importRestaurantCustomers(
  restaurantId: string,
  rows: CustomerImportRow[]
): Promise<CustomerImportResult> {
  const { data, error } = await supabase.rpc('import_restaurant_customers', {
    p_restaurant_id: restaurantId,
    p_rows: rows,
  });

  if (error) throw new Error(error.message);
  return data as CustomerImportResult;
}
