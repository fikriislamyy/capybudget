<script lang="ts">import {page} from '$app/state';import VendorBillsScreen from '$lib/components/business/vendor-bills-screen.svelte';</script>
<VendorBillsScreen billId={page.params.billId}/>
