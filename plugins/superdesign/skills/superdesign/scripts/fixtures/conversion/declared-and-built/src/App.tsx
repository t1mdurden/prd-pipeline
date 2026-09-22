export default function Page() {
  return (
    <main className="bg-background text-foreground p-6">
      <h1 className="text-2xl font-semibold">Get a quote</h1>
      <form className="mt-6 grid gap-4">
        <label htmlFor="from" className="text-sm">From</label>
        <input id="from" name="from" className="border-border rounded-md border px-3 py-2" />
        <button type="submit" className="bg-primary text-primary-foreground rounded-md px-4 py-2">Send</button>
      </form>
    </main>
  )
}
