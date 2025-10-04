import { supabase } from "../../supabase/config.js";

// Utility
function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

// Handle job posting
async function handleJobPost(event) {
  event.preventDefault();
  const data = formToObject(event.target);

  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();
  if (sessionError || !user) {
    alert("You must be logged in to post a job.");
    return;
  }

  const skillSelect = document.getElementById("requiredSkillsSelect");
  const selectedSkillIds = Array.from(skillSelect.selectedOptions).map((opt) =>
    parseInt(opt.value)
  );

const { error } = await supabase.from("jobs").insert({
  client_id: user.id,
  title: data.title,
  description: data.description,
  expected_outcome: data.expected_outcome,
  required_skill_ids: selectedSkillIds,
  preferred_tone: data.preferred_tone,
  budget: parseFloat(data.budget),
  language: data.language || "English",
  deadline: data.deadline ? new Date(data.deadline).toISOString() : null, // ✅ add this line
  approved: false,
});

  if (error) {
    alert("Job posting failed: " + error.message);
  } else {
    alert("Job submitted! Awaiting admin approval.");
    event.target.reset();
  }
}

// Load matches for this client
export async function loadMatches() {
  const matchesList = document.getElementById("matchesList");

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    matchesList.innerHTML =
      "<p class='error'>You must be logged in to view matches.</p>";
    return;
  }

  // ✅ Fetch matches with freelancer skills + skill names + hires
  const { data, error: matchError } = await supabase
    .from("job_matches")
    .select(
      `
    id,
    score,
    approved,
    jobs(
      id,
      title,
      description,
      client_id,
      required_skill_ids,
      hires(id)
    ),
users(
  id,
  full_name,
  tone,
  language,
  inbit_choice,
  inbit_partner,
  main_badges(name),
  freelancer_skills(
    skill_id,
    verified,
    skills_master(skill_name)
  )
)

  `
    )
    .eq("approved", true);

  if (matchError) {
    matchesList.innerHTML = "<p class='error'>Error loading matches.</p>";
    console.error(matchError);
    return;
  }

  // ✅ Only client’s matches
  const clientMatches = data.filter((m) => m.jobs.client_id === user.id);

  // ✅ Filter: only show matches if no hire exists for that job
  const unHiredMatches = clientMatches.filter(
    (m) => !m.jobs.hires || m.jobs.hires.length === 0
  );

  if (unHiredMatches.length === 0) {
    matchesList.innerHTML =
      "<p class='loading'>No available matches (job already hired).</p>";
    return;
  }

  // Create proper grid structure
  matchesList.innerHTML = '<div class="matches-grid"></div>';
  const matchesGrid = matchesList.querySelector(".matches-grid");

  unHiredMatches.forEach((match, index) => {
    const freelancer = match.users;
    const jobSkills = match.jobs.required_skill_ids || [];
    const freelancerSkills = freelancer.freelancer_skills || [];

    // ✅ Match skills vs job required skills
    const matchedSkills = freelancerSkills.filter((fs) =>
      jobSkills.includes(fs.skill_id)
    );

    const matchedList = matchedSkills
      .map(
        (s) =>
          `<li>${s.skills_master.skill_name} ${
            s.verified ? "<span class='badge verified'>Verified</span>" : ""
          }</li>`
      )
      .join("");

    const card = document.createElement("div");
    card.classList.add("card");
    card.style.animationDelay = `${index * 0.1}s`;

    card.innerHTML = `
      <h3>${match.jobs.title}</h3>
      <p class="job-description">${match.jobs.description}</p>
      <hr>
      <div class="match-info">
        <p><strong>Freelancer:</strong> ${freelancer.full_name}</p>
        <div class="freelancer-badges">
  ${
    freelancer.main_badges
      ? `<span class="badge ladder">${freelancer.main_badges.name}</span>`
      : ""
  }
  ${freelancer.inbit_choice ? `<span class="badge choice">Inbit Choice</span>` : ""}
  ${freelancer.inbit_partner ? `<span class="badge partner">Inbit Partner</span>` : ""}
</div>

        <p><strong>Tone:</strong> ${freelancer.tone}</p>
        <p><strong>Language:</strong> ${freelancer.language}</p>
        <p><strong>Match Score:</strong> <span class="score-indicator">${
          match.score
        }%</span></p>
      </div>
      <div class="matched-skills">
        <h4>Matched Skills</h4>
        ${
          matchedSkills.length > 0
            ? `<ul>${matchedList}</ul>`
            : `<p class="no-skills">No skills matched yet</p>`
        }
      </div>
      <div class="card-actions">
  <button class="btn btn-primary hire-btn">Hire Freelancer</button>
  <button class="btn btn-secondary view-profile-btn" data-id="${freelancer.id}">
    View Profile
  </button>
</div>

    `;

    card.querySelector(".hire-btn").addEventListener("click", () => {
      hireFreelancer(
        match.id,
        freelancer.id,
        freelancer.full_name,
        match.jobs.id
      );
    });

    matchesGrid.appendChild(card);
  });

  // View profile
document.querySelectorAll(".view-profile-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const freelancerId = e.target.dataset.id;
    window.location.href = `../client/freelancer-profile.html?id=${freelancerId}`;
  });
});

}

// Hire freelancer
window.hireFreelancer = async function (
  matchId,
  freelancerId,
  freelancerName,
  jobId
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    alert("You must be logged in.");
    return;
  }

  const { data, error } = await supabase
    .from("hires")
    .insert({
      job_id: jobId,
      client_id: user.id,
      freelancer_id: freelancerId,
    })
    .select("id")
    .single();

  if (error) {
    alert("Failed to hire: " + error.message);
  } else {
    alert(`You hired ${freelancerName}!`);
    window.location.href = `../chat/chat.html?hire=${data.id}`;
  }
};

// Load skills for job posting
async function loadSkills(selectId) {
  const { data, error } = await supabase
    .from("skills_master")
    .select("*")
    .order("skill_name");
  if (error) {
    console.error("Error loading skills:", error.message);
    return;
  }

  const select = document.getElementById(selectId);
  data.forEach((skill) => {
    const option = document.createElement("option");
    option.value = skill.id;
    option.textContent = skill.skill_name;
    select.appendChild(option);
  });
}

// Notifications
async function loadNotifications() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = document.getElementById("notificationsList");
  if (error || !data || data.length === 0) {
    list.innerHTML = "<li class='loading'>No notifications</li>";
    return;
  }

  list.innerHTML = "";
  data.forEach((n) => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${n.message}
      <button class="dismiss-btn" data-id="${n.id}">Dismiss</button>
    `;
    list.appendChild(li);
  });

  document.querySelectorAll(".dismiss-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await deleteNotification(id);
      e.target.parentElement.remove();
    });
  });
}

async function deleteNotification(id) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete notification:", error.message);
  }
}

// Hires
async function loadHires() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: hires, error } = await supabase
    .from("hires")
    .select(
      `
      id,
      created_at,
      jobs(title, description),
      users!hires_freelancer_id_fkey(full_name),
      final_submissions(status, id),
      contracts(status, id, created_at)
    `
    )
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  const container = document.getElementById("hiresList");
  if (error || !hires || hires.length === 0) {
    container.innerHTML = "<p class='loading'>No hires yet.</p>";
    return;
  }

  // ✅ filter logic: keep hires with no contracts, or with at least one non-completed
  const activeHires = hires.filter((hire) => {
    if (!hire.contracts || hire.contracts.length === 0) return true;
    return hire.contracts.some((c) => c.status !== "completed");
  });

  if (activeHires.length === 0) {
    container.innerHTML = "<p class='loading'>No active hires.</p>";
    return;
  }

  container.innerHTML = '<div class="hires-grid"></div>';
  const hiresGrid = container.querySelector(".hires-grid");

  activeHires.forEach((hire, index) => {
    const finalSub = hire.final_submissions?.[0];
    const latestContract = hire.contracts?.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )[0];

    let contractButton = "";
    if (finalSub) {
      if (finalSub.status === "approved") {
        contractButton = `
          <a href="../client/create-contract.html?hire=${hire.id}&final=${finalSub.id}">
            <button class="btn btn-success">Create Contract</button>
          </a>`;
      } else {
        contractButton = `<button class="btn btn-disabled">
          Create Contract (status: ${finalSub.status})
        </button>`;
      }
    } else {
      contractButton = `<button class="btn btn-disabled">
        Create Contract (no submission yet)
      </button>`;
    }

    const status = latestContract ? latestContract.status : "No contract yet";

    const card = document.createElement("div");
    card.classList.add("card");
    card.style.animationDelay = `${index * 0.1}s`;

    card.innerHTML = `
      <h3>${hire.jobs.title}</h3>
      <p>${hire.jobs.description}</p>
      <p><strong>Freelancer:</strong> ${hire.users.full_name}</p>
      <p><strong>Status:</strong> ${status}</p>
      <small>Hired on ${new Date(hire.created_at).toLocaleString()}</small>
      <p><strong>Hire ID:</strong> ${hire.id}</p>
      <div class="card-actions">
        <button class="btn btn-primary"
          onclick="window.location.href='../chat/chat.html?hire=${hire.id}'">
          Chat
        </button>
        ${contractButton}
      </div>
    `;

    hiresGrid.appendChild(card);
  });
}

// Initialize everything
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Load components based on current page
  if (document.getElementById("matchesList")) loadMatches();
  if (document.getElementById("notificationsList")) loadNotifications();
  if (document.getElementById("hiresList")) loadHires();
  if (document.getElementById("requiredSkillsSelect"))
    loadSkills("requiredSkillsSelect");

  // Attach job form if exists
  const jobForm = document.getElementById("jobPostForm");
  if (jobForm) jobForm.addEventListener("submit", handleJobPost);
});

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("matchesList")) loadMatches();
  if (document.getElementById("hiresList")) loadHires();
});

// CLIENT: create contract (called from create-contract.html form)
// - Validates inputs
// - Ensures the caller is the client for the hire
// - Ensures the final submission is APPROVED and belongs to the hire
// - Prevents duplicate contracts for the same final_submission_id
// - Inserts contract with status 'pending_details' and notifies freelancer
export async function createContract(
  hireId,
  finalSubmissionId,
  paymentMethod,
  amount
) {
  try {
    // basic validation
    if (!hireId || !finalSubmissionId)
      throw new Error("Missing hireId or finalSubmissionId.");
    if (!paymentMethod) throw new Error("Please select a payment method.");
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0)
      throw new Error("Invalid amount.");

    // get current user
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    if (!user) throw new Error("Not logged in.");

    // fetch hire and verify client ownership & freelancer presence
    const { data: hire, error: hireErr } = await supabase
      .from("hires")
      .select("client_id, freelancer_id")
      .eq("id", hireId)
      .single();
    if (hireErr) throw hireErr;
    if (!hire) throw new Error("Hire not found.");
    if (hire.client_id !== user.id)
      throw new Error("You are not the owner of this hire.");

    // verify final submission exists, belongs to this hire, and is approved by admin
    const { data: finalSub, error: finalErr } = await supabase
      .from("final_submissions")
      .select("id, hire_id, status")
      .eq("id", finalSubmissionId)
      .single();
    if (finalErr) throw finalErr;
    if (!finalSub) throw new Error("Final submission not found.");
    if (finalSub.hire_id !== hireId)
      throw new Error("Final submission does not belong to this hire.");
    if (finalSub.status !== "approved")
      throw new Error(
        "Final submission must be approved by admin before creating a contract."
      );

    // prevent duplicate contract for the same final_submission
    const { data: existing, error: existErr } = await supabase
      .from("contracts")
      .select("id")
      .eq("final_submission_id", finalSubmissionId)
      .limit(1)
      .maybeSingle();
    if (existErr) throw existErr;
    if (existing)
      throw new Error("A contract already exists for this final submission.");

    // insert contract (status waiting for freelancer to provide per-contract details)
    const { data: created, error: insertErr } = await supabase
      .from("contracts")
      .insert([
        {
          hire_id: hireId,
          final_submission_id: finalSubmissionId,
          client_id: user.id,
          freelancer_id: hire.freelancer_id,
          payment_method: paymentMethod,
          total_amount: parseFloat(amount),
          status: "pending_details",
        },
      ])
      .select("id, hire_id, freelancer_id")
      .single();

    if (insertErr) throw insertErr;

    // notify freelancer to provide payment details for this contract
    await supabase.from("notifications").insert({
      user_id: created.freelancer_id,
      type: "action",
      message: `Client created contract ${created.id}. Please provide payment receiving details for this contract.`,
    });

    // return the created contract minimal info
    return created;
  } catch (err) {
    // rethrow so caller can show user-friendly message
    console.error("createContract error:", err);
    throw err;
  }
}

export async function markPaymentSent(contractId, proofFile = null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  // Verify contract exists and client owns it
  const { data: contract, error: contErr } = await supabase
    .from("contracts")
    .select("client_id, freelancer_id")
    .eq("id", contractId)
    .single();
  if (contErr) throw contErr;
  if (contract.client_id !== user.id) throw new Error("Not authorized");

  // Check freelancer provided payment details
  const { data: details, error: detailsErr } = await supabase
    .from("contract_payment_details")
    .select("*")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (detailsErr || !details) {
    throw new Error(
      "Freelancer has not provided payment receiving details yet."
    );
  }

  // Upload proof if provided
  let proofUrl = null;
  if (proofFile) {
    const path = `contract-proofs/${contractId}/${Date.now()}-${
      proofFile.name
    }`;
    const { error: upErr } = await supabase.storage
      .from("proofs")
      .upload(path, proofFile);
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage
      .from("proofs")
      .getPublicUrl(path);
    proofUrl = urlData.publicUrl;
  }

  // Update contract
  const { error } = await supabase
    .from("contracts")
    .update({
      client_marked_sent: true,
      proof_url: proofUrl,
      status: "payment_sent",
    })
    .eq("id", contractId);

  if (error) throw error;

  // notify freelancer & admin
  await supabase.from("notifications").insert([
    {
      user_id: contract.freelancer_id,
      type: "payment",
      message: `Client marked payment sent for contract ${contractId}.`,
    },
  ]);

  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .eq("role", "admin");
  for (const a of admins || []) {
    await supabase.from("notifications").insert({
      user_id: a.id,
      type: "payment",
      message: `Client marked payment sent for contract ${contractId}. Please review proof and confirm.`,
    });
  }

  return true;
}

async function loadClientSummary() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return;

  // 1️⃣ Fetch client info
  const { data: client, error: clientError } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .single();

  if (clientError) {
    console.error("Client fetch error:", clientError);
    return;
  }

  // 2️⃣ Calculate total spent & active contracts
  const { data: contracts, error: contractsError } = await supabase
    .from("contracts")
    .select("total_amount, status")
    .eq("client_id", user.id);

  if (contractsError) {
    console.error("Contracts fetch error:", contractsError);
    return;
  }

  let totalSpent = 0;
  let activeCount = 0;

  contracts.forEach((c) => {
    if (c.status === "completed" || c.status === "client_marked_sent") {
      totalSpent += Number(c.total_amount);
    }
    if (c.status !== "completed") {
      activeCount++;
    }
  });

  // 3️⃣ Render into DOM
  document.getElementById("clientName").textContent = client.full_name;
  document.getElementById("totalSpent").textContent =
    totalSpent.toLocaleString();
  document.getElementById("activeContracts").textContent = activeCount;
}

// 🔥 Run on page load
document.addEventListener("DOMContentLoaded", () => {
  loadClientSummary();
});

// Theme Toggle Functionality
function initThemeToggle() {
  const themeToggle = document.getElementById("themeToggle");
  if (!themeToggle) return;

  const themeIcon = themeToggle.querySelector(".theme-icon");
  const themeLabel = themeToggle.querySelector(".theme-label");

  // Check for saved theme or prefer-color-scheme
  const savedTheme = localStorage.getItem("client-theme");
  const prefersLight = window.matchMedia(
    "(prefers-color-scheme: light)"
  ).matches;

  if (savedTheme === "light" || (!savedTheme && prefersLight)) {
    document.documentElement.setAttribute("data-theme", "light");
    themeIcon.textContent = "🌙";
    themeLabel.textContent = "Dark Mode";
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    themeIcon.textContent = "☀️";
    themeLabel.textContent = "Light Mode";
  }

  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");

    if (currentTheme === "light") {
      document.documentElement.setAttribute("data-theme", "dark");
      themeIcon.textContent = "☀️";
      themeLabel.textContent = "Light Mode";
      localStorage.setItem("client-theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      themeIcon.textContent = "🌙";
      themeLabel.textContent = "Dark Mode";
      localStorage.setItem("client-theme", "light");
    }
  });
}

// Initialize theme toggle when DOM loads
document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
});
