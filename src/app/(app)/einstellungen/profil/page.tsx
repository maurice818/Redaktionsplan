import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { requireProfile } from "@/lib/auth";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Mein Profil" };

export default async function ProfilePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("job_title").eq("id", profile.id).single();
  return (
    <div>
      <PageHeader title="Mein Profil" description={`${profile.email} · Rolle: ${ROLE_LABELS[profile.role]} – ${ROLE_DESCRIPTIONS[profile.role]}`} />
      <Section title="Angaben">
        <ProfileForm fullName={profile.full_name} jobTitle={data?.job_title ?? ""} />
      </Section>
    </div>
  );
}
