import { POSITIONING, VALIDATION_NOTE } from "../data/copy";
import { Icon } from "./Icon";
import { hrefFor } from "../lib/router";

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`disclaimer${compact ? " disclaimer--compact" : ""}`}>
      <p>
        <strong>{POSITIONING}</strong>
      </p>
      <p>{VALIDATION_NOTE}</p>
      {compact ? null : (
        <p>
          {/* หน้าอธิบายแบบไฟล์เดียวใน public/ สำหรับผู้ใหญ่ (มีภาพเคลื่อนไหว) */}
          <a className="disclaimer__link" href="how-it-works.html">
            หลักการทำงานของเครื่องและที่มาของเกม
          </a>
        </p>
      )}
    </footer>
  );
}

/** Demo-only view switch. It is not authentication or access control. */
export function ViewSwitch({ current }: { current: "kid" | "teacher" }) {
  return (
    <nav className="viewswitch" aria-label="สลับมุมมองเดโม">
      <span className="viewswitch__label">ต้นแบบเดโม · มุมมอง</span>
      <a className="viewswitch__link" href={hrefFor("home")} aria-current={current === "kid" ? "page" : undefined}>
        ฝั่งเด็ก
      </a>
      <a className="viewswitch__link" href={hrefFor("dashboard")} aria-current={current === "teacher" ? "page" : undefined}>
        นักแก้ไขการพูด
      </a>
    </nav>
  );
}

/** Summary row of every "for the adult" drawer: one short title, what is inside, and a chevron. */
export function CareSummary({ title = "สำหรับผู้ดูแล", sub }: { title?: string; sub: string }) {
  return (
    <summary className="care__summary">
      <span className="care__icon" aria-hidden="true">
        <Icon name="user" size={18} />
      </span>
      <span className="care__text">
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      <span className="care__chev" aria-hidden="true">
        <Icon name="next" size={18} />
      </span>
    </summary>
  );
}
