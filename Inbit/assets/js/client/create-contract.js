import { supabase } from "../../../supabase/config.js";

/**
 * createContract(...) - inserts contract row after validating ownership & final submission status
 */
export async function createContract(hireId, finalSubmissionId, paymentMethod, amount) {
  try {
    if (!hireId || !finalSubmissionId) throw new Error("Missing hireId or finalSubmissionId.");
    if (!paymentMethod) throw new Error("Please select a payment method.");
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) throw new Error("Invalid amount.");

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    if (!user) throw new Error("Not logged in.");

    const { data: hire, error: hireErr } = await supabase
      .from("hires")
      .select("client_id, freelancer_id, jobs(title)")
      .eq("id", hireId)
      .single();
    if (hireErr) throw hireErr;
    if (!hire) throw new Error("Hire not found.");
    if (hire.client_id !== user.id) throw new Error("You are not the owner of this hire.");

    const { data: finalSub, error: finalErr } = await supabase
      .from("final_submissions")
      .select("id, hire_id, status")
      .eq("id", finalSubmissionId)
      .single();
    if (finalErr) throw finalErr;
    if (!finalSub) throw new Error("Final submission not found.");
    if (finalSub.hire_id !== hireId) throw new Error("Final submission does not belong to this hire.");
    if (finalSub.status !== "approved") throw new Error("Final submission must be approved by admin before creating a contract.");

    const { data: existing, error: existErr } = await supabase
      .from("contracts")
      .select("id")
      .eq("final_submission_id", finalSubmissionId)
      .maybeSingle();
    if (existErr) throw existErr;
    if (existing) throw new Error("A contract already exists for this final submission.");

    const { data: created, error: insertErr } = await supabase
      .from("contracts")
      .insert([{
        hire_id: hireId,
        final_submission_id: finalSubmissionId,
        client_id: user.id,
        freelancer_id: hire.freelancer_id,
        payment_method: paymentMethod,
        total_amount: parseFloat(amount),
        status: "pending_details"
      }])
      .select("id, hire_id, freelancer_id")
      .single();

    if (insertErr) throw insertErr;

    await supabase.from("notifications").insert({
      user_id: created.freelancer_id,
      type: "action",
      message: `Client created contract ${created.id} for job "${hire.jobs.title}". Please provide payment receiving details.`
    });

    return created;
  } catch (err) {
    console.error("createContract error:", err);
    throw err;
  }
}

/* ---------- form wiring & page logic ---------- */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contractForm");
  if (!form) {
    console.warn("contractForm not found on page.");
    return;
  }

  // Read hire/final from query string
  const params = new URLSearchParams(window.location.search);
  const hireId = params.get("hire");
  const finalId = params.get("final");

  if (!hireId || !finalId) {
    alert("Invalid contract creation request. Missing job or final submission.");
    form.style.display = 'none';
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.innerHTML;
    
    // Show loading state
    submitBtn.innerHTML = '<span class="btn-icon">⏳</span> Creating Contract...';
    submitBtn.disabled = true;

    const paymentMethod = document.getElementById("paymentMethod").value;
    const amount = document.getElementById("amount").value;

    try {
      const created = await createContract(hireId, finalId, paymentMethod, amount);
      
      // Show success state
      submitBtn.innerHTML = '<span class="btn-icon">✅</span> Contract Created!';
      submitBtn.style.background = 'var(--accent-success)';
      
      setTimeout(() => {
        window.location.href = "contracts.html";
      }, 1500);
      
    } catch (err) {
      // Reset button state
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
      
      // Show error message
      alert(err.message || "Failed to create contract.");
      console.error(err);
    }
  });

  // Add real-time validation
  document.getElementById('amount').addEventListener('input', function(e) {
    const value = parseFloat(e.target.value);
    if (value && value < 1) {
      e.target.setCustomValidity('Amount must be at least $1');
    } else {
      e.target.setCustomValidity('');
    }
  });
});
