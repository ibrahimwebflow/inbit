import { supabase } from "../../../supabase/config.js";

// Load freelancer settings on page load
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();

  // ✅ Attach to the correct form ID from your HTML
  document
    .getElementById("freelancerSettingsForm")
    .addEventListener("submit", saveSettings);

  // Preview profile picture instantly
  document
    .getElementById("profile_picture")
    .addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById("profilePreview").src =
          URL.createObjectURL(file);
      }
    });
});

// Load user data
async function loadSettings() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    alert("You must be logged in");
    return;
  }

const { data, error } = await supabase
  .from("users")
  .select(`
    full_name, 
    email, 
    language, 
    tone, 
    profile_picture,
    inbit_choice,
    inbit_partner,
    main_badges(name),
    achievements
  `)
  .eq("id", user.id)
  .single();


  if (error) {
    console.error("Error loading settings:", error);
    return;
  }

  document.getElementById("full_name").value = data.full_name || "";
  document.getElementById("email").value = data.email || "";
  document.getElementById("language").value = data.language || "English";
  document.getElementById("tone").value = data.tone || "professional";

  // Render badges
const badgesDiv = document.getElementById("badgesDisplay");
badgesDiv.innerHTML = ""; // clear

// Main ladder badge
if (data.main_badges?.name) {
  badgesDiv.innerHTML += `<span class="badge main-badge">${data.main_badges.name}</span>`;
}

// Inbit choice / partner
if (data.inbit_choice) {
  badgesDiv.innerHTML += `<span class="badge special-badge">Inbit Choice</span>`;
}
if (data.inbit_partner) {
  badgesDiv.innerHTML += `<span class="badge special-badge">Inbit Partner</span>`;
}

// Achievements (JSONB array)
if (Array.isArray(data.achievements)) {
  data.achievements.forEach((ach) => {
    badgesDiv.innerHTML += `<span class="badge achievement-badge">${ach}</span>`;
  });
}


  const avatar = document.getElementById("profilePreview");
  if (data.profile_picture) {
    const { data: urlData } = supabase.storage
      .from("profile_pictures")
      .getPublicUrl(data.profile_picture);
    avatar.src = urlData.publicUrl;
  } else {
    avatar.src = "../assets/images/default-avatar.png"; // ✅ follows your HTML path
  }
}

// Save user data
async function saveSettings(event) {
  event.preventDefault();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const fullName = document.getElementById("full_name").value;
  const language = document.getElementById("language").value;
  const tone = document.getElementById("tone").value;
  const profileFile = document.getElementById("profile_picture").files[0];

  let profilePath = null;

  // Upload profile picture if selected
  if (profileFile) {
const path = `avatars/${user.id}/${Date.now()}-profile.jpg`;
const { error: uploadErr } = await supabase.storage
  .from("profile_pictures")
  .upload(path, profileFile, { upsert: true });

if (uploadErr) {
  console.error("Upload failed:", uploadErr.message);
  alert("Profile picture upload failed: " + uploadErr.message);
  return;
}

    profilePath = path;
  }

  // Update database
  const updateData = {
    full_name: fullName,
    language,
    tone,
  };
  if (profilePath) updateData.profile_picture = profilePath;

  const { error } = await supabase
    .from("users")
    .update(updateData)
    .eq("id", user.id);

  if (error) {
    alert("Update failed: " + error.message);
    return;
  }

  alert("Settings updated successfully!");
  await loadSettings();
}

