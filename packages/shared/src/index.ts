// Shared contract home for restaurant-platform.
//
// Single source of truth for the API contract: Zod DTOs, enum value sets, the
// kitchen state machine, integer-centavos money helpers, and Loyverse echo /
// dedup helpers. The NestJS API validates with these schemas; the frontend
// builds against these types. Never duplicate the contract elsewhere.
export * from './domain/index';
export * from './db/database.types';
