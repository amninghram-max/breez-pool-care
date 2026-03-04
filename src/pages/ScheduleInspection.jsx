diff --git a/src/pages/ScheduleInspection.jsx b/src/pages/ScheduleInspection.jsx
index 4049689b3530ab051225ad75cbe6568ddb6a426b..886542469d08f0c908d7d5499c977fdf1da75dd1 100644
--- a/src/pages/ScheduleInspection.jsx
+++ b/src/pages/ScheduleInspection.jsx
@@ -152,65 +152,74 @@ export default function ScheduleInspection() {
         phone: phone.trim(),
         email: leadData?.email,
         serviceAddress: {
           street: street.trim(),
           city: city.trim(),
           state: state.trim(),
           zip: zip.trim()
         },
         requestedDate: isoDate,
         requestedTimeSlot: selectedSlot,
       };
 
       let data;
       try {
         const res = await Promise.race([
           base44.functions.invoke('scheduleFirstInspectionPublicV2', schedulePayload),
           timeoutPromise
         ]);
         data = res?.data ?? res;
       } catch (v2Err) {
         const msg = String(v2Err?.message || v2Err || '');
         const shouldFallback = msg.includes('timed out') || msg.includes('Deployment does not exist') || msg.includes('FUNCTION_NOT_FOUND');
         if (!shouldFallback) throw v2Err;
       }
 
-      // Fallback to V1 if V2 unavailable or timed out
-      if (!data || (data?.success !== true && (String(data?.error || '').includes('Deployment does not exist') || data?.code === 'FUNCTION_NOT_FOUND'))) {
+      // Fallback to V1 if V2 unavailable/timed out or V2 is blocked by platform create permissions
+      const v2Unavailable = !data || (data?.success !== true && (String(data?.error || '').includes('Deployment does not exist') || data?.code === 'FUNCTION_NOT_FOUND'));
+      const v2CreateBlocked = data?.success !== true && ['INSPECTION_CREATE_FAILED', 'INSPECTION_CREATE_FORBIDDEN'].includes(data?.code);
+      if (v2Unavailable || v2CreateBlocked) {
         const v1Res = await Promise.race([
           base44.functions.invoke('scheduleFirstInspectionPublicV1', schedulePayload),
           timeoutPromise
         ]);
         data = v1Res?.data ?? v1Res;
       }
 
       if (data?.success === true) {
         setConfirmed(data);
         // Email was triggered server-side; consume the returned status
         setEmailStatus(data.emailStatus === 'failed' ? 'failed' : 'sent');
       } else {
-        const errorMsg = data?.error || 'Failed to schedule inspection. Please call (321) 524-3838.';
+        const codeMessages = {
+          TOKEN_NOT_FOUND: 'Invalid or expired token.',
+          INCOMPLETE_DATA: 'Token does not have complete lead information.',
+          QUERY_ERROR: 'We could not verify your quote token. Please try again.',
+          INSPECTION_CREATE_FAILED: "We couldn't create your inspection. Please contact Breez at (321) 524-3838.",
+          INSPECTION_CREATE_FORBIDDEN: "We couldn't create your inspection. Please contact Breez at (321) 524-3838."
+        };
+        const errorMsg = codeMessages[data?.code] || data?.error || 'Failed to schedule inspection. Please call (321) 524-3838.';
         setError(errorMsg);
       }
     } catch (e) {
       setError(e?.message || 'Something went wrong. Please call us at (321) 524-3838.');
     } finally {
       setLoading(false);
     }
   };
 
   // Loading state
   if (loadingLead) {
     return (
       <div className="min-h-screen bg-gray-50 flex flex-col">
         <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
           <img
             src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/699a2b2056054b0207cea969/0b0c31666_Breez2.png"
             alt="Breez Pool Care"
             className="h-10 w-auto cursor-pointer"
             onClick={() => navigate('/')}
           />
           <a href="tel:3215243838" className="text-sm text-gray-500 hover:text-gray-700">(321) 524-3838</a>
         </header>
         <div className="flex-1 flex items-center justify-center px-4">
           <div className="flex flex-col items-center gap-3 text-gray-500">
             <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
