// FIXTURE — the AS-20 negative control. A component that ACTUALLY fetches and ships only the
// success state. Added with the F5 fix: detector 20 used to select any file containing `.map(`,
// which caught `slopped.tsx` (a presentational component handed a `rows` prop) and every static
// marketing section in a real build. The selector now requires a real data signal, so the rule
// needs a file that carries one — otherwise the F5 fix would silently retire the detector.
import { useQuery } from "@tanstack/react-query"

export function InvoiceList() {
  const { data } = useQuery({ queryKey: ["invoices"], queryFn: () => fetch("/api/invoices").then((r) => r.json()) })
  return (
    <ul>
      {data?.map((row: { id: string }) => (
        <li key={row.id}>{row.id}</li>
      ))}
    </ul>
  )
}
