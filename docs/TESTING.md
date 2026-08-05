# AquaFix — notes for the onsite testing team

Thanks for trying this. It is a rebuild of the Mendix app, so most of it should feel
familiar. What we need from you is not "does it look right" but **does it survive a real
round of inspections** — bad signal, gloves on, a valve that isn't in the list, an asset
someone renamed last week.

---

## Signing in

Open the URL you were sent. Use whichever account matches how you actually work:

| Email | Password | Who this is |
|---|---|---|
| `user@aquafix.test` | `password123` | Field worker. Records inspections and incidents. **Cannot delete anything.** |
| `admin@aquafix.test` | `password123` | Supervisor. Everything above, plus deleting and configuring checklists. |

Please spend most of your time in the **field worker** account. That is the one the job
actually runs on.

---

## The one flow that matters

1. **Inspect** → pick the asset you are standing at.
2. Answer each check. Required ones are marked with a red asterisk and the form will not
   submit without them.
3. **Submit inspection.**
4. You land on a result screen showing a grade for each reading and one overall grade.

**The overall grade is the worst single reading.** One Critical answer makes the whole
inspection Critical, even if everything else was fine. That is deliberate. Tell us if it
reads wrong to you in practice.

Things worth trying to break:

- Submit with a required answer missing — it should scroll you to the offending one.
- Put a wild number into a reading (negative, enormous, a decimal with six places).
- Inspect the same asset twice in a row.
- Start an inspection, go back, come back to it.
- Do it one-handed on a phone. If a tap target is too small, that is a bug, tell us.

---

## What is in there now

Four locations, ten assets, four asset types, and a checklist per type. It is invented
data, not yours — the point is to exercise the flow. **Anything you type will be seen by
everyone else testing, and all of it gets wiped before real use.** Don't put anything
confidential in the notes fields.

| Asset type | What gets checked |
|---|---|
| Pump | Discharge pressure, noise/vibration, oil level, casing leak, comments |
| Pressure Valve | Operable through full travel, visible corrosion, comments |
| Storage Tank | Water level %, hatch secure, debris, comments |
| Flow Meter | Meter reading, display legible, comments |

---

## Incidents

**Report an incident** from the home screen for anything that needs following up and is
not a routine reading. Pick a type, describe it, optionally attach it to an asset or a
location. Status moves New → In progress → Completed; completing one stamps the date.

---

## What is deliberately not there yet

Please don't report these — we know:

- **No photos.** Image capture is the next slice. Every "attach a photo" habit you have
  will fail today.
- **No offline mode.** If you lose signal mid-inspection, the submit will fail. It should
  fail *visibly*, with your answers still on screen — if it instead loses your work,
  that is very much a bug and we want to hear about it immediately.
- **No scheduled instructions / planned work.** The recurring-inspection scheduler from
  the old app is not rebuilt.
- **No Excel import or export.**
- **No user self-registration.** Accounts are created for you.

---

## Reporting back

Most useful, in order:

1. **What you were doing, what you expected, what happened.** A screenshot beats a
   description.
2. Which account you were signed in as, and whether it was a phone or a laptop.
3. Anything that was slower than it should be, or that you had to do twice.

Anything that loses recorded work, or grades a reading in a way a supervisor would
disagree with, is top priority. Everything else can wait.
