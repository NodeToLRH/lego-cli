<template>
  <button @click="warning">点我</button>
</template>

<script>
export default {
  methods: {
    warning() {
      alert('warning!');
    }
  }
}
</script>
