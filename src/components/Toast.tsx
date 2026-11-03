import { useSyncExternalStore } from "react";
import { getToasts, subscribeToasts } from "../lib/toast";
import { Icon } from "./Icon";

export function ToastRegion() {
  const list = useSyncExternalStore(subscribeToasts, getToasts);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <Icon name="check" size={18} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
