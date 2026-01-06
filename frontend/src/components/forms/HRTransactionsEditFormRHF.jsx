import React, { useEffect } from "react";
import PropTypes from "prop-types";
import { useForm } from "react-hook-form";
import { Box, Grid, TextField, MenuItem } from "@mui/material";

const HRTransactionsEditFormRHF = ({ defaultValues, onSubmit }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    defaultValues,
  });

  // When drawer opens with a different row, reset form values
  useEffect(() => {
    if (defaultValues) {
      reset(defaultValues);
    }
  }, [defaultValues, reset]);

  const handleFormSubmit = (data) => {
    // Pass the raw data back to parent; parent will handle API call.
    if (onSubmit) {
      onSubmit(data);
    }
  };

  return (
    <Box
      component="form"
      id="hr-ledger-edit-form"
      onSubmit={handleSubmit(handleFormSubmit)}
      noValidate
      sx={{ mt: 1 }}
    >
      <Grid container spacing={2}>
        {/* Code (read-only) */}
        <Grid item xs={12}>
          <TextField
            label="Code"
            fullWidth
            size="small"
            value={defaultValues?.code || ""}
            InputProps={{
              readOnly: true,
            }}
          />
        </Grid>

        {/* Employee Name (read-only display) */}
        <Grid item xs={12}>
          <TextField
            label="Employee"
            fullWidth
            size="small"
            value={defaultValues?.shortName || ""}
            InputProps={{
              readOnly: true,
            }}
          />
        </Grid>

        {/* Division (read-only, for now) */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Division"
            fullWidth
            size="small"
            value={defaultValues?.division || ""}
            InputProps={{
              readOnly: true,
            }}
          />
        </Grid>

        {/* Cost Centre (read-only, for now) */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Cost Centre"
            fullWidth
            size="small"
            value={defaultValues?.costCentre || ""}
            InputProps={{
              readOnly: true,
            }}
          />
        </Grid>

        {/* Type (read-only, e.g. salary) */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Type"
            fullWidth
            size="small"
            value={defaultValues?.type || ""}
            InputProps={{
              readOnly: true,
            }}
          />
        </Grid>

        {/* Amount (editable) */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Amount"
            fullWidth
            size="small"
            type="number"
            inputProps={{ step: "0.01" }}
            error={!!errors.amount}
            helperText={errors.amount?.message}
            {...register("amount", {
              required: "Amount is required",
            })}
          />
        </Grid>

        {/* Period start */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Period start"
            fullWidth
            size="small"
            type="date"
            InputLabelProps={{ shrink: true }}
            error={!!errors.periodStart}
            helperText={errors.periodStart?.message}
            {...register("periodStart", {
              required: "Start date is required",
            })}
          />
        </Grid>

        {/* Period end */}
        <Grid item xs={12} sm={6}>
          <TextField
            label="Period end"
            fullWidth
            size="small"
            type="date"
            InputLabelProps={{ shrink: true }}
            error={!!errors.periodEnd}
            helperText={errors.periodEnd?.message}
            {...register("periodEnd", {
              required: "End date is required",
            })}
          />
        </Grid>

        {/* Notes */}
        <Grid item xs={12}>
          <TextField
            label="Notes"
            fullWidth
            size="small"
            multiline
            minRows={2}
            {...register("notes")}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

HRTransactionsEditFormRHF.propTypes = {
  defaultValues: PropTypes.object,
  onSubmit: PropTypes.func,
};

export default HRTransactionsEditFormRHF;
