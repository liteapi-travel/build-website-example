// Initialize the SDK with your API key

async function searchHotels() {
	document.getElementById("loader").style.display = "block";

	// Clear previous hotel elements
	const hotelsDiv = document.getElementById("hotels");
	hotelsDiv.innerHTML = "";

	console.log("Searching for hotels...");
	const checkin = document.getElementById("checkin").value;
	const checkout = document.getElementById("checkout").value;
	const adults = document.getElementById("adults").value;
	const city = document.getElementById("city").value;
	const countryCode = document.getElementById("countryCode").value;
	const environment = document.getElementById("environment").value;

	console.log("Checkin:", checkin, "Checkout:", checkout, "Adults", adults);

	try {
		// Make a request to your backend server
		const response = await fetch(
			`http://localhost:3000/search-hotels?checkin=${checkin}&checkout=${checkout}&adults=${adults}&city=${city}&countryCode=${countryCode}&environment=${environment}`
		);
		const rates = (await response.json()).rates;
		console.log(rates);
		displayRatesAndHotels(rates);

		document.getElementById("loader").style.display = "none";
	} catch (error) {
		console.error("Error fetching hotels:", error);
		document.getElementById("loader").style.display = "none";
	}
}

function displayRatesAndHotels(rates) {
	const hotelsDiv = document.getElementById("hotels");

	rates.forEach((rate) => {
		const minRate = rate.roomTypes.reduce((min, current) => {
			const minAmount = min.rates[0].retailRate.total[0].amount;
			const currentAmount = current.rates[0].retailRate.total[0].amount;
			return minAmount < currentAmount ? min : current;
		});
		console.log();

		const hotelElement = document.createElement("div");
		hotelElement.innerHTML = `
		<div class='card-container'>
		<div class='card'>
			<div class='flex items-start'>
				<div class='card-image'>
					<img
						src='${rate.hotel.main_photo}'
						alt='hotel'
					/>
				</div>
				<div class='flex-between-end w-full'>
					<div>
						<h4 class='card-title'>${minRate.rates[0].name}</h4>
						<h3 class='card-id'>Hotel Name : ${rate.hotel.name}</h3>
						<p class='featues'>
							Max Occupancy ∙ <span>${minRate.rates[0].maxOccupancy}</span> Adult Count
							∙ <span>${minRate.rates[0].adultCount}</span> Child Count ∙
							<span>${minRate.rates[0].childCount}</span>
							Board Type ∙ <span>${minRate.rates[0].boardType}</span> Board Name ∙
							<span> ${minRate.rates[0].boardName}</span>
						</p>
						<p class='red flex items-center'>
							<span>
								${minRate.rates[0].cancellationPolicies.refundableTag == "NRFN"
				? "Non refundable"
				: "Refundable"
			}
							</span>
						</p>
					</div>
<p class='flex flex-col mb-0'>
    <span class="${minRate.rates[0].retailRate.total[0].amount}"></span>
    <span class="${minRate.rates[0].retailRate.suggestedSellingPrice[0].amount}"></span>
    <span class="original-price">
        Original Price: <s>${minRate.rates[0].retailRate.suggestedSellingPrice[0].amount} ${minRate.rates[0].retailRate.suggestedSellingPrice[0].currency}</s>
    </span>
    <button class='price-btn' onclick="proceedToBooking('${minRate.offerId}')">
        BOOK NOW ${minRate.rates[0].retailRate.total[0].amount} ${minRate.rates[0].retailRate.total[0].currency}
    </button>
</p>
				</div>
			</div>
		</div>
	</div>
        `;

		hotelsDiv.appendChild(hotelElement);
	});
}

async function proceedToBooking(rateId) {
	console.log("Proceeding to booking for hotel ID:", rateId);

	// Clear existing HTML and display the loader
	const hotelsDiv = document.getElementById("hotels");
	const loader = document.getElementById("loader");
	hotelsDiv.innerHTML = "";
	loader.style.display = "block";

	// Create and append the form dynamically
	const formHtml = `
        <form id="bookingForm">
            <input type="hidden" name="prebookId" value="${rateId}">
            <label>Guest First Name:</label>
            <input type="text" name="guestFirstName" required><br>
            <label>Guest Last Name:</label>
            <input type="text" name="guestLastName" required><br>
            <label>Guest Email:</label>
            <input type="email" name="guestEmail" required><br><br>
            <label>Credit Card Holder Name:</label>
            <input type="text" name="holderName" required><br>
			<label>Voucher Code:</label>
            <input type="text" name="voucher"><br>
            <input type="submit" value="Book Now">
        </form>
    `;
	hotelsDiv.innerHTML = formHtml; // Insert the form into the 'hotels' div
	loader.style.display = "none";

	// Add event listener to handle form submission
	document.getElementById("bookingForm").addEventListener("submit", async function (event) {
		event.preventDefault();
		loader.style.display = "block";

		const formData = new FormData(event.target);
		const guestFirstName = formData.get('guestFirstName');
		const guestLastName = formData.get('guestLastName');
		const guestEmail = formData.get('guestEmail');
		const holderName = formData.get('holderName');
		const voucher = formData.get('voucher');
		const environment = document.getElementById("environment").value;

		try {
			// Include additional guest details in the payment processing request
			const bodyData = {
				environment,
				rateId
			};

			// Add voucher if it exists
			if (voucher) {
				bodyData.voucherCode = voucher;
			}
			console.log(bodyData);

			const prebookResponse = await fetch(`http://localhost:3000/prebook`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(bodyData),
			});

			const prebookData = await prebookResponse.json();
			console.log("preboook successful!", prebookData.success.data)
			// Assuming prebookData.success.data includes the necessary fields
			const paymentData = {
				currency: prebookData.success.data.currency,
				price: prebookData.success.data.price, // Ensure this field exists
				voucherTotalAmount: prebookData.success.data.voucherTotalAmount // Ensure this field exists or use a default if optional
			};
			displayPaymentInfo(paymentData);

			initializePaymentForm(
				prebookData.success.data.secretKey,
				prebookData.success.data.prebookId,
				prebookData.success.data.transactionId,
				guestFirstName,
				guestLastName,
				guestEmail
			);
		} catch (error) {
			console.error("Error in payment processing or booking:", error);
		} finally {
			loader.style.display = "none";
		}
	});
}

function displayPaymentInfo(data) {
	console.log("display payment data function called)")
	const paymentDiv = document.getElementById('hotels');
	if (!paymentDiv) {
		console.error('paymentInfo div not found');
		return;
	}
	// Destructure the necessary data from the object
	const { price, currency, voucherTotalAmount } = data;

	// Create content for the div
	let content = `<p>Amount: ${price} ${currency}</p>`;

	// Check if voucherTotalAmount is available and add it to the content
	if (voucherTotalAmount && voucherTotalAmount > 0) {
		content += `<p>Voucher Total Amount: ${voucherTotalAmount} ${currency}</p>`;
	}

	// Update the div's content
	paymentDiv.innerHTML = content;
}