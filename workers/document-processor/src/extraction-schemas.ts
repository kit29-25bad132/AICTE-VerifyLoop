import { z } from 'zod';
const Evidence = z.object({ field: z.string(), page: z.number(), quote: z.string().max(300), grounded: z.boolean().optional() });
export const FacultyListSchema = z.object({ faculty_total: z.number().optional(), student_intake_total: z.number().optional(), faculty_members: z.array(z.object({ name: z.string(), pan_number: z.string().optional() })).optional(), institution_name: z.string().optional(), evidence: z.array(Evidence) });
export const LandDeedSchema = z.object({ land_area_acres: z.number().optional(), stamp_purchase_date: z.string().optional(), deed_execution_date: z.string().optional(), institution_name: z.string().optional(), evidence: z.array(Evidence) });
export const FireSafetySchema = z.object({ expiry_date: z.string().optional(), institution_name: z.string().optional(), evidence: z.array(Evidence) });
export const NocSchema = z.object({ noc_date: z.string().optional(), institution_name: z.string().optional(), evidence: z.array(Evidence) });
export const FloorPlanSchema = z.object({ total_built_area_sqm: z.number().optional(), computer_lab_area_sqm: z.number().optional(), library_area_sqm: z.number().optional(), institution_name: z.string().optional(), evidence: z.array(Evidence) });
export function getSchemaForDocType(type: string) { return ({ FACULTY_LIST: FacultyListSchema, LAND_DEED: LandDeedSchema, FIRE_SAFETY: FireSafetySchema, NOC: NocSchema, FLOOR_PLAN: FloorPlanSchema } as Record<string, typeof FacultyListSchema | typeof LandDeedSchema | typeof FireSafetySchema | typeof NocSchema | typeof FloorPlanSchema>)[type] ?? null; }
export type DocSchema = z.ZodTypeAny;
