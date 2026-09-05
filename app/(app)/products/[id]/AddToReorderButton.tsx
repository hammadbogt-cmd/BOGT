"use client";

import { useActionState } from "react";
import { addToReorderAction, type AddToReorderState } from "../../../actions/reorder-actions";

const initialState: AddToReorderState = {};

export function AddToReorderButton({
  productId,
  recommendedQty,
  supplierId,
  supplierPrice,
}: {
  productId: string;
  recommendedQty: number;
  supplierId?: string | null;
  supplierPrice?: number | null;
}) {
  const [state, formAction, isPending] = useActionState(addToReorderAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="recommendedQty" value={recommendedQty} />
      {supplierId && <input type="hidden" name="supplierId" value={supplierId} />}
      {supplierPrice != null && <input type="hidden" name="supplierPrice" value={supplierPrice} />}
      <button
        type="submit"
        disabled={isPending || recommendedQty <= 0}
        className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
      >
        {isPending ? "Adding..." : `Add to Reorder (${recommendedQty} units)`}
      </button>
      {state.success && <span className="text-xs text-green-700">Added to the Quick Reorder List.</span>}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
