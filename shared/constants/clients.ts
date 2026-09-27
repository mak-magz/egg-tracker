// Client field keys, limits and copy (docs/features/03-clients.md §3.3, §2.5 "Copy").
// The server's `ApiErrorData.fields` keys and the form's messages come from here, so both say the same thing.
// No message here ever repeats a value the owner typed (AC29): they name the field, or the OTHER client's own
// name, which the form passes in.

/** Keys used in `ApiErrorData.fields` by the clients routes. */
export const CLIENT_FIELDS = {
  name: 'name',
  phone: 'phone',
  defaultPrice: 'defaultPrice',
  submissionId: 'submissionId',
  version: 'version',
  id: 'id',
} as const

/** Longest client name, in characters (code points), after normalising. Equals `clients_name_length` in the M12 migration. */
export const MAX_CLIENT_NAME_LENGTH = 60

/** Longest phone, in characters, after trimming. Equals `clients_phone_valid` in the M12 migration. */
export const MAX_CLIENT_PHONE_LENGTH = 30

/**
 * Longest RAW name or phone (before normalising) the database will even look at: a cheap cap (security audit M-2)
 * so a regex never runs on megabytes. Equals `assert_client_input_size` in the M12 migration.
 */
export const MAX_CLIENT_TEXT_INPUT_LENGTH = 200

/** Most clients one farm can have, inactive ones included (they are never deleted). Equals the TM021 cap in the M12 migration. */
export const MAX_CLIENTS_PER_FARM = 500

/** Largest default price (per tray). Currency-independent (AC13). Equals `clients_default_price_valid` in the M12 migration. */
export const MAX_CLIENT_PRICE = 9999.99

/** Most decimals a price may have. Currency-independent for now (AC13); the currency follow-up re-checks it. */
export const CLIENT_PRICE_DECIMALS = 2

/**
 * §2.5 copy used by validation on both the server and the form. Functions take the OTHER client's name as it is
 * saved ("You already have a client called Maple Street Market."). `priceTooLarge` takes the limit already
 * formatted by the shared price rule, so the form shows it in the farm's currency (`₱9,999.99`).
 */
export const CLIENT_MESSAGES = {
  nameBlank: 'Enter a name.',
  nameTooLong: 'Use 60 characters or fewer.',
  nameInvalid: 'This name has a hidden character. Try typing it instead of pasting.',
  nameTaken: (existing: string) => `You already have a client called ${existing}.`,
  /** Add form: the message is followed by a "Mark {name} active" button. */
  nameInactive: (existing: string) => `${existing} is on your list, but marked inactive. Mark it active instead.`,
  /** Edit form: text only (reactivating another client from inside this one's Edit form would be surprising). */
  nameInactiveEdit: (existing: string) => `${existing} is on your list, but marked inactive. Pick another name, or mark it active from the list.`,
  /** The server's own `fields.name` for a clash: generic on purpose, no value (AC29). The form composes the friendly one from `existing`. */
  nameTakenServer: 'That name already exists.',
  phoneTooLong: 'Use 30 characters or fewer.',
  phoneInvalid: 'This phone number has a hidden character. Try typing it instead of pasting.',
  priceNotANumber: 'Use numbers only, like 250.00.',
  priceNotPositive: 'Enter a price above 0, or leave it blank.',
  priceTooManyDecimals: 'Use 2 decimals at most, like 6.50.',
  priceTooLarge: (max: string) => `The most you can enter is ${max}.`,
  /** The server's copy for the same case: the limit as a plain number, with no currency symbol. */
  priceTooLargeServer: 'The most you can enter is 9,999.99.',
  limitReached: 'You\'ve reached the limit of 500 clients. You can still edit the ones you have.',
  changedElsewhere: 'This client was changed somewhere else. The list is up to date now.',
} as const
