const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const liteApi = require("liteapi-node-sdk");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

app.use(
  cors({
    origin: "*",
  })
);

const prod_apiKey = process.env.PROD_API_KEY;
const sandbox_apiKey = process.env.SAND_API_KEY;

app.use(bodyParser.json());

app.get("/search-hotels", async (req, res) => {
  console.log("Search endpoint hit");
  const { checkin, checkout, adults, city, countryCode, environment } = req.query;
  const apiKey = environment == "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.getHotels(countryCode, city, 0, 10);
    const data = (await response).data;
    const hotelIds = data.map((hotel) => hotel.id);
    const rates = (
      await sdk.getFullRates({
        hotelIds: hotelIds,
        occupancies: [{ adults: parseInt(adults, 10) }],
        currency: "USD",
        guestNationality: "US",
        checkin: checkin,
        checkout: checkout,
      })
    ).data;
    rates.forEach((rate) => {
      rate.hotel = data.find((hotel) => hotel.id === rate.hotelId);
    });

    res.json({ rates });
  } catch (error) {
    console.error("Error searching for hotels:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/search-rates", async (req, res) => {
  console.log("Rate endpoint hit");
  const { checkin, checkout, adults, hotelId, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    // Fetch rates only for the specified hotel
    const rates = (
      await sdk.getFullRates({
        hotelIds: [hotelId],
        occupancies: [{ adults: parseInt(adults, 10) }],
        currency: "USD",
        guestNationality: "US",
        checkin: checkin,
        checkout: checkout,
      })
    ).data;

    // Fetch hotel details
    const hotelsResponse = await sdk.getHotelDetails(hotelId);
    const hotelInfo = hotelsResponse.data;

    // Prepare the response data
    const rateInfo = rates.map((hotel) =>
      hotel.roomTypes.flatMap((roomType) => {
        // Define the board types we're interested in
        const boardTypes = ["RO", "BI"];

        // Filter rates by board type and sort by refundable tag
        return boardTypes
          .map((boardType) => {
            const filteredRates = roomType.rates.filter((rate) => rate.boardType === boardType);

            // Sort to prioritize 'RFN' over 'NRFN'
            const sortedRates = filteredRates.sort((a, b) => {
              if (
                a.cancellationPolicies.refundableTag === "RFN" &&
                b.cancellationPolicies.refundableTag !== "RFN"
              ) {
                return -1; // a before b
              } else if (
                b.cancellationPolicies.refundableTag === "RFN" &&
                a.cancellationPolicies.refundableTag !== "RFN"
              ) {
                return 1; // b before a
              }
              return 0; // no change in order
            });

            // Return the first rate meeting the criteria if it exists
            if (sortedRates.length > 0) {
              const rate = sortedRates[0];
              return {
                rateName: rate.name,
                offerId: roomType.offerId,
                board: rate.boardName,
                refundableTag: rate.cancellationPolicies.refundableTag,
                retailRate: rate.retailRate.total[0].amount,
                originalRate: rate.retailRate.suggestedSellingPrice[0].amount,
              };
            }
            return null; // or some default object if no rates meet the criteria
          })
          .filter((rate) => rate !== null); // Filter out null values if no rates meet the criteria
      })
    );
    res.json({ hotelInfo, rateInfo });
  } catch (error) {
    console.error("Error fetching rates:", error);
    res.status(500).json({ error: "No availability found" });
  }
});

app.post("/prebook", async (req, res) => {
  //console.log(req.body);
  const { rateId, environment, voucherCode } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);
  //console.log(apiKey, "apiKey");
  const bodyData = {
    offerId: rateId,
    usePaymentSdk: true,
  };

  // Conditionally add the voucherCode if it exists in the request body
  if (voucherCode) {
    bodyData.voucherCode = voucherCode;
  }

  try {
    // Call the SDK's prebook method and handle the response
    sdk
      .preBook(bodyData)
      .then((response) => {
        res.json({ success: response }); // Send response back to the client
      })
      .catch((err) => {
        console.error("Error:", err); // Print the error if any
        res.status(500).json({ error: "Internal Server Error" }); // Send error response
      });
  } catch (err) {
    console.error(" Prebook error:", err); // Handle errors related to SDK usage
    res.status(500).json({ error: "Internal Server Error" }); // Send error response
  }
});

app.get("/book", (req, res) => {
  console.log(req.query);
  const { prebookId, guestFirstName, guestLastName, guestEmail, transactionId, environment } =
    req.query;

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

	// Prepare the booking data
  const bodyData = {
    holder: {
      firstName: guestFirstName,
      lastName: guestLastName,
      email: guestEmail,
    },
    payment: {
      method: "TRANSACTION_ID",
      transactionId: transactionId,
    },
    prebookId: prebookId,
    guests: [
      {
        occupancyNumber: 1,
        remarks: "",
        firstName: guestFirstName,
        lastName: guestLastName,
        email: guestEmail,
      },
    ],
  };

  console.log(bodyData);

  sdk
    .book(bodyData)
    .then((data) => {
      if (!data || data.error) {
        // Validate if there's any error in the data
        throw new Error(
          "Error in booking data: " + (data.error ? data.error.message : "Unknown error")
        );
      }

      console.log(data);

      res.send(`
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Confirmation</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
        }
        h1 {
            color: #333;
        }
        .booking-details, .room-details, .policy-details {
            margin-bottom: 20px;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
        }
        .header {
            font-weight: bold;
            color: #444;
        }
    </style>
</head>
<body>
    <h1>Booking Confirmation</h1>
    <div class="booking-details">
        <div class="header">Booking Information:</div>
        <p>Booking ID: ${data.data.bookingId}</p>
        <p>Supplier Name: ${data.data.supplierBookingName} (${data.data.supplier})</p>
        <p>Status: ${data.data.status}</p>
        <p>Check-in: ${data.data.checkin}</p>
        <p>Check-out: ${data.data.checkout}</p>
        <p>Hotel: ${data.data.hotel.name} (ID: ${data.data.hotel.hotelId})</p>
    </div>

    <div class="room-details">
        <div class="header">Room Details:</div>
        <p>Room Type: ${data.data.bookedRooms[0].roomType.name}</p>
        <p>Rate (Total): $${data.data.bookedRooms[0].rate.retailRate.total.amount} ${
        data.data.bookedRooms[0].rate.retailRate.total.currency
      }</p>
        <p>Occupancy: ${data.data.bookedRooms[0].adults} Adult(s), ${
        data.data.bookedRooms[0].children
      } Child(ren)</p>
        <p>Guest Name: ${data.data.bookedRooms[0].firstName} ${
        data.data.bookedRooms[0].lastName
      }</p>
    </div>
<div class="policy-details">
    <div class="header">Cancellation Policy:</div>
    <p>Cancel By: ${
      data.data.cancellationPolicies &&
      data.data.cancellationPolicies.cancelPolicyInfos &&
      data.data.cancellationPolicies.cancelPolicyInfos[0]
        ? data.data.cancellationPolicies.cancelPolicyInfos[0].cancelTime
        : "Not specified"
    }</p>
    <p>Cancellation Fee: ${
      data.data.cancellationPolicies &&
      data.data.cancellationPolicies.cancelPolicyInfos &&
      data.data.cancellationPolicies.cancelPolicyInfos[0]
        ? `$${data.data.cancellationPolicies.cancelPolicyInfos[0].amount}`
        : "Not specified"
    }</p>
    <p>Remarks: ${data.data.remarks || "No additional remarks."}</p>
</div>

    <a href="/"><button>Back to Hotels</button></a>
</body>
</html>
      `);
    })
    .catch((err) => {
      console.error("Error during booking:", err);
      res.status(500).send(`Failed to book: ${err.message}`);
    });
});

// Serve the client-side application
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

app.use(express.static(path.join(__dirname, "../client")));

const port = 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
