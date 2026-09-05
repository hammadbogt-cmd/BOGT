"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../lib/auth/current-user";
import { recordAudit } from "../../lib/audit";

export interface SupplierFormState {
  success?: boolean;
  error?: string;
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = strOrNull(v);
  if (s == null) return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) ? n : null;
}

export async function createSupplierAction(_prev: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  try {
    const user = await requirePermission("manage_suppliers");
    const name = strOrNull(formData.get("name"));
    if (!name) return { error: "Supplier name is required." };

    const existing = await prisma.supplier.findUnique({ where: { name } });
    if (existing) return { error: `A supplier named "${name}" already exists.` };

    const supplier = await prisma.supplier.create({
      data: {
        name,
        contactName: strOrNull(formData.get("contactName")),
        contactEmail: strOrNull(formData.get("contactEmail")),
        contactPhone: strOrNull(formData.get("contactPhone")),
        currency: strOrNull(formData.get("currency")) ?? "AED",
        leadTimeDays: intOrNull(formData.get("leadTimeDays")),
        moq: intOrNull(formData.get("moq")),
        casePack: intOrNull(formData.get("casePack")),
        priority: intOrNull(formData.get("priority")) ?? 100,
        notes: strOrNull(formData.get("notes")),
      },
    });

    await recordAudit({
      userId: user.id,
      action: "CREATE_SUPPLIER",
      entityType: "Supplier",
      entityId: supplier.id,
      newValue: { name },
      source: "ui",
    });

    revalidatePath("/suppliers");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateSupplierAction(_prev: SupplierFormState, formData: FormData): Promise<SupplierFormState> {
  try {
    const user = await requirePermission("manage_suppliers");
    const id = String(formData.get("id"));
    const before = await prisma.supplier.findUniqueOrThrow({ where: { id } });

    const data = {
      contactName: strOrNull(formData.get("contactName")),
      contactEmail: strOrNull(formData.get("contactEmail")),
      contactPhone: strOrNull(formData.get("contactPhone")),
      currency: strOrNull(formData.get("currency")) ?? "AED",
      leadTimeDays: intOrNull(formData.get("leadTimeDays")),
      moq: intOrNull(formData.get("moq")),
      casePack: intOrNull(formData.get("casePack")),
      priority: intOrNull(formData.get("priority")) ?? 100,
      notes: strOrNull(formData.get("notes")),
      isActive: formData.get("isActive") === "on",
      lastUpdateAt: new Date(),
    };

    await prisma.supplier.update({ where: { id }, data });

    await recordAudit({
      userId: user.id,
      action: "UPDATE_SUPPLIER",
      entityType: "Supplier",
      entityId: id,
      oldValue: before as unknown as Record<string, unknown>,
      newValue: data,
      source: "ui",
    });

    revalidatePath("/suppliers");
    revalidatePath(`/suppliers/${id}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
