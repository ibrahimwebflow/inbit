import { supabase } from "../../supabase/config.js";

// Utility: get form data into an object
function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

// Handle Freelancer Signup
async function handleFreelancerSignup(event) {
  event.preventDefault();
  const data = formToObject(event.target);

  // 1. Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password
  });

  if (authError) {
    alert("Signup failed: " + authError.message);
    return;
  }

  const userId = authData.user.id;

  // 2. Upload Government ID
  const govIdFile = document.getElementById("gov_id").files[0];
  let govIdUrl = null;

  if (govIdFile) {
    const path = `${userId}/${Date.now()}-${govIdFile.name}`;
    const { error: uploadErr } = await supabase.storage
      .from("id_verifications")
      .upload(path, govIdFile);

    if (uploadErr) {
      alert("ID upload failed: " + uploadErr.message);
      return;
    }

    // get private URL (for admin only, better store path not public URL)
    govIdUrl = path;
  } else {
    alert("Government ID is required.");
    return;
  }

  // 3. Insert into users table
  const { error: dbError } = await supabase.from("users").insert({
    id: userId,
    email: data.email,
    role: "freelancer",
    full_name: data.full_name,
    tone: data.tone,
    language: data.language || "English",
    verified: false,
    available: false,
    gov_id_path: govIdUrl // store storage path for admin checks
  });

  if (dbError) {
    alert("DB insert failed: " + dbError.message);
    return;
  }

  // 4. Insert selected skill IDs
  const skillSelect = document.getElementById("skillsSelect");
  const selectedSkillIds = Array.from(skillSelect.selectedOptions).map(opt => parseInt(opt.value));

  for (let skillId of selectedSkillIds) {
    await supabase.from("freelancer_skills").insert({
      freelancer_id: userId,
      skill_id: skillId,
      verified: false
    });
  }

  alert("Freelancer signup successful! Please wait for admin verification.");
  window.location.href = "../freelancer/login.html";
}



// Handle Client Signup
async function handleClientSignup(event) {
  event.preventDefault();
  const data = formToObject(event.target);

  // 1. Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
  });

  if (authError) {
    alert("Signup failed: " + authError.message);
    return;
  }

  const user = authData.user;
  if (!user) {
    alert("Signup failed: User not created.");
    return;
  }

  // 2. Upload Government ID
  let govIdPath = null;
  const govIdFile = document.getElementById("gov_id").files[0];
  if (govIdFile) {
    govIdPath = `${user.id}/${Date.now()}-${govIdFile.name}`;

    const { error: uploadError } = await supabase.storage
      .from("ids")
      .upload(govIdPath, govIdFile);

    if (uploadError) {
      alert("ID upload failed: " + uploadError.message);
      return;
    }
  }

  // 3. Insert into users table
  const { error: dbError } = await supabase.from("users").insert({
    id: user.id,
    email: data.email,
    role: "client",
    full_name: data.full_name,
    tone: data.tone,
    language: data.language || "English",
    verified: false,
    business_name: data.account_type === "business" ? data.business_name : null,
    gov_id_path: govIdPath,
  });

  if (dbError) {
    alert("DB insert failed: " + dbError.message);
    return;
  }

  alert("Client signup successful! Please wait for admin verification.");
  window.location.href = "../client/login.html";
}



// Attach listeners
document.addEventListener("DOMContentLoaded", () => {
  const freelancerForm = document.getElementById("freelancerSignupForm");
  if (freelancerForm) freelancerForm.addEventListener("submit", handleFreelancerSignup);

  const clientForm = document.getElementById("clientSignupForm");
  if (clientForm) clientForm.addEventListener("submit", handleClientSignup);
});


// // Utility: get form data
// function formToObject(form) {
//   const data = new FormData(form);
//   return Object.fromEntries(data.entries());
// }

// LOGIN HANDLER (Freelancer)
async function handleFreelancerLogin(event) {
  event.preventDefault();
  const data = formToObject(event.target);

  const { data: loginData, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  });

  if (error) {
    alert("Login failed: " + error.message);
    return;
  }

  // Check user role in DB
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("role, verified")
    .eq("id", loginData.user.id)
    .single();

  if (userError) {
    alert("Error fetching user role: " + userError.message);
    return;
  }

  if (!user.verified) {
    alert("Your account is not yet verified by admin.");
    return;
  }

  if (user.role !== "freelancer") {
    alert("This is not a freelancer account.");
    return;
  }

  window.location.href = "../freelancer/dashboard.html";
}

// LOGIN HANDLER (Client)
async function handleClientLogin(event) {
  event.preventDefault();
  const data = formToObject(event.target);

  const { data: loginData, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  });

  if (error) {
    alert("Login failed: " + error.message);
    return;
  }

  // Check role
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("role, verified")
    .eq("id", loginData.user.id)
    .single();

  if (userError) {
    alert("Error fetching user role: " + userError.message);
    return;
  }

  if (!user.verified) {
    alert("Your account is not yet verified by admin.");
    return;
  }

  if (user.role !== "client") {
    alert("This is not a client account.");
    return;
  }

  window.location.href = "../client/dashboard.html";
}

// Attach listeners
document.addEventListener("DOMContentLoaded", () => {
  // Signup handlers (already written earlier)
  const freelancerForm = document.getElementById("freelancerSignupForm");
  if (freelancerForm) freelancerForm.addEventListener("submit", handleFreelancerSignup);

  const clientForm = document.getElementById("clientSignupForm");
  if (clientForm) clientForm.addEventListener("submit", handleClientSignup);

  // Login handlers
  const freelancerLoginForm = document.getElementById("freelancerLoginForm");
  if (freelancerLoginForm) freelancerLoginForm.addEventListener("submit", handleFreelancerLogin);

  const clientLoginForm = document.getElementById("clientLoginForm");
  if (clientLoginForm) clientLoginForm.addEventListener("submit", handleClientLogin);
});


// Load skills into select
async function loadSkills(selectId) {
  const { data, error } = await supabase.from("skills_master").select("*").order("skill_name");
  if (error) {
    console.error("Error loading skills:", error.message);
    return;
  }

  const select = document.getElementById(selectId);
  data.forEach(skill => {
    const option = document.createElement("option");
    option.value = skill.id;
    option.textContent = skill.skill_name;
    select.appendChild(option);
  });
}

// Attach listeners
document.addEventListener("DOMContentLoaded", () => {
  const freelancerForm = document.getElementById("freelancerSignupForm");
  if (freelancerForm) {
    freelancerForm.addEventListener("submit", handleFreelancerSignup);
    loadSkills("skillsSelect"); // 👈 populate freelancer signup skills
  }

  const clientForm = document.getElementById("clientSignupForm");
  if (clientForm) {
    clientForm.addEventListener("submit", handleClientSignup);
  }

  const freelancerLoginForm = document.getElementById("freelancerLoginForm");
  if (freelancerLoginForm) freelancerLoginForm.addEventListener("submit", handleFreelancerLogin);

  const clientLoginForm = document.getElementById("clientLoginForm");
  if (clientLoginForm) clientLoginForm.addEventListener("submit", handleClientLogin);
});